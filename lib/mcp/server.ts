import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AGENT_REGION, loadAgent, type AgentContext } from "@/lib/agents";
import { createObjective, getObjective, listLocations, type StoredPlan } from "@/lib/objectives";
import { formatUsd } from "@/lib/money";

// SIDEQUEST's agent API (spec §15). Every tool runs as the authenticated agent principal; the
// platform, not the agent, enforces spending policy. There is deliberately no tool that edits policy.

type Json = Record<string, unknown>;

function ok(data: Json) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function refused(data: Json) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true };
}

const usd = (minor: number) => formatUsd(minor);

function policyView(agent: AgentContext) {
  const p = agent.policy;
  return {
    agent: agent.name,
    accountable_principal: agent.principalName,
    currency: "USD",
    daily_limit: usd(p.daily_limit_minor),
    committed_today: usd(agent.spentTodayMinor),
    remaining_today: usd(Math.max(0, p.daily_limit_minor - agent.spentTodayMinor)),
    per_mission_limit: usd(p.per_mission_limit_minor),
    allowed_categories: p.allowed_categories,
    allowed_region: p.allowed_region,
    human_approval_required_above: usd(p.requires_human_approval_above_minor),
    can_publish_without_principal: p.auto_publish,
    can_release_payment: p.auto_release_payment,
  };
}

async function objectiveStatus(objectiveId: string, agentId: string) {
  const data = await getObjective(objectiveId);
  if (!data || data.objective.agent_id !== agentId) return null;
  const missions = await db()<{
    id: string;
    title: string;
    state: string;
    reward_minor: number;
    location: string | null;
    operator: string | null;
    review: string | null;
    payment: string | null;
    payout_item_id: string | null;
  }[]>`
    select m.id, m.title, m.state, m.reward_minor, l.name as location, u.display_name as operator,
           (select r.result from evidence_reviews r where r.mission_id = m.id order by r.created_at desc limit 1) as review,
           ob.status as payment,
           (select t.provider_payout_item_id from payment_transactions t where t.obligation_id = ob.id and t.operation = 'PAYOUT' limit 1) as payout_item_id
    from missions m
    left join locations l on l.id = m.location_id
    left join assignments a on a.mission_id = m.id and a.status not in ('WITHDRAWN', 'CANCELLED')
    left join users u on u.id = a.operator_id
    left join payment_obligations ob on ob.assignment_id = a.id
    where m.objective_id = ${objectiveId} order by m.created_at`;
  const [funding] = await db()<{ state: string; amount_minor: number; captured_minor: number; provider_authorization_id: string | null }[]>`
    select state, amount_minor, captured_minor, provider_authorization_id from funding_authorizations where objective_id = ${objectiveId}`;
  const plan = data.plan?.plan_json as StoredPlan | undefined;
  return {
    objective_id: objectiveId,
    status: data.objective.state,
    request: data.objective.request_text,
    budget: usd(data.objective.budget_minor),
    policy_decision: data.plan?.risk.decision ?? null,
    policy_reasons: data.plan?.risk.reasons ?? [],
    plan_summary: plan?.summary ?? null,
    proposed_missions:
      data.objective.state === "AWAITING_APPROVAL"
        ? (plan?.missions ?? []).map((m) => ({ title: m.title, category: m.category, location_id: m.location_id, reward: usd(m.reward_minor) }))
        : undefined,
    missions: missions.map((m) => ({
      mission_id: m.id,
      title: m.title,
      location: m.location,
      reward: usd(m.reward_minor),
      status: m.state,
      operator: m.operator,
      latest_proof_review: m.review,
      payment_status: m.payment,
      paypal_payout_item_id: m.payout_item_id,
    })),
    paypal_funding: funding
      ? {
          status: funding.state,
          held: usd(funding.amount_minor),
          captured: usd(funding.captured_minor),
          authorization_id: funding.provider_authorization_id,
        }
      : null,
    note: "Payment statuses come from PayPal sandbox responses. A mission is PAID only after PayPal confirms the payout.",
  };
}

export function buildMcpServer(agentId: string, appUrl: string): McpServer {
  const server = new McpServer(
    { name: "sidequest", version: "0.1.0" },
    {
      instructions:
        "SIDEQUEST hires vetted local people to complete short physical-world verification missions (photographing permitted displays, confirming public signage) and pays them through PayPal. You act for your accountable principal within a spending policy the platform enforces. Check get_spending_policy before creating objectives. Your principal approves plans and the PayPal hold; you cannot release payments.",
    },
  );

  server.registerTool(
    "get_spending_policy",
    {
      title: "Get spending policy",
      description: "Your spending limits, what you've committed today, allowed mission categories and region.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const agent = await loadAgent(agentId);
      if (!agent) return refused({ error: "Agent credentials are revoked or unknown." });
      return ok(policyView(agent));
    },
  );

  server.registerTool(
    "list_locations",
    {
      title: "List permitted locations",
      description: "Locations where the principal has permission on file for missions, with what each permission covers.",
      annotations: { readOnlyHint: true },
    },
    async () => ok({ region: AGENT_REGION, locations: await listLocations() }),
  );

  server.registerTool(
    "create_mission_objective",
    {
      title: "Create mission objective",
      description:
        "Describe a physical-world outcome in plain English with a budget. SIDEQUEST plans local missions with AI, then checks them against your spending policy. Over-limit or prohibited requests are refused with reasons. Approved plans wait for your principal to approve the PayPal hold.",
      inputSchema: {
        request: z.string().min(15).max(2000).describe("What needs to happen, where, and what proof is needed."),
        budget_usd: z.number().positive().max(10000).describe("Maximum total budget in US dollars."),
        deadline_hours: z.number().int().min(24).max(168).default(48).describe("Hours until the missions are due (24-168)."),
      },
    },
    async ({ request, budget_usd, deadline_hours }) => {
      const agent = await loadAgent(agentId);
      if (!agent) return refused({ error: "Agent credentials are revoked or unknown." });
      const budgetMinor = Math.round(budget_usd * 100);
      const { id, policy } = await createObjective({
        requesterId: agent.principalUserId,
        requestText: request,
        budgetMinor,
        deadline: new Date(Date.now() + deadline_hours * 3_600_000),
        actor: { type: "agent", id: agent.id },
        agent: { id: agent.id, policy: agent.policy, spentTodayMinor: agent.spentTodayMinor, region: AGENT_REGION },
      });
      const status = await objectiveStatus(id, agent.id);
      const review_url = `${appUrl}/objectives/${id}`;
      if (policy.decision === "REJECT") {
        return refused({
          refused: true,
          objective_id: id,
          reasons: policy.reasons,
          your_policy: policyView(agent),
          review_url,
          hint: "Lower the budget, or split the work so each mission stays within your limits, then try again.",
        });
      }
      return ok({
        accepted: true,
        ...status,
        next_step: `${agent.principalName} reviews the plan and approves the PayPal hold at ${review_url}. Missions are published to operators only after that.`,
        review_url,
      });
    },
  );

  server.registerTool(
    "get_mission_status",
    {
      title: "Get mission status",
      description: "Status of one of your objectives: plan, missions, operators, proof reviews and PayPal payment IDs.",
      inputSchema: { objective_id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ objective_id }) => {
      const status = await objectiveStatus(objective_id, agentId);
      if (!status) return refused({ error: "No objective with that id belongs to this agent." });
      return ok({ ...status, review_url: `${appUrl}/objectives/${objective_id}` });
    },
  );

  server.registerTool(
    "list_my_objectives",
    {
      title: "List my objectives",
      description: "Your most recent objectives and their status.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await db()<{ id: string; request_text: string; state: string; budget_minor: number; created_at: Date }[]>`
        select id, request_text, state, budget_minor, created_at from objectives
        where agent_id = ${agentId} order by created_at desc limit 20`;
      return ok({
        objectives: rows.map((r) => ({ objective_id: r.id, request: r.request_text, status: r.state, budget: usd(r.budget_minor), created_at: r.created_at.toISOString() })),
      });
    },
  );

  server.registerTool(
    "approve_mission",
    {
      title: "Approve completed mission",
      description:
        "Approve a completed mission so its operator is paid. Only allowed if your policy permits releasing payment; otherwise your principal must approve in SIDEQUEST.",
      inputSchema: { mission_id: z.string().uuid() },
    },
    async ({ mission_id }) => {
      const agent = await loadAgent(agentId);
      if (!agent) return refused({ error: "Agent credentials are revoked or unknown." });
      const [m] = await db()<{ state: string; objective_id: string; agent_id: string | null }[]>`
        select m.state, m.objective_id, o.agent_id from missions m join objectives o on o.id = m.objective_id where m.id = ${mission_id}`;
      if (!m || m.agent_id !== agent.id) return refused({ error: "No mission with that id belongs to this agent." });
      await audit(db(), {
        actorType: "agent",
        actorId: agent.id,
        action: "agent.approve_requested",
        resourceType: "mission",
        resourceId: mission_id,
        metadata: { allowed: agent.policy.auto_release_payment, mission_state: m.state },
      });
      if (!agent.policy.auto_release_payment) {
        return refused({
          refused: true,
          reason: `Your policy doesn't allow releasing payment. ${agent.principalName} approves completed missions and PayPal payouts in SIDEQUEST.`,
          mission_status: m.state,
          review_url: `${appUrl}/missions/${mission_id}`,
        });
      }
      return refused({ refused: true, reason: "Agent-released payments are not enabled in this build." });
    },
  );

  return server;
}
