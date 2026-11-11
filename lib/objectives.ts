import "server-only";
import { db } from "@/lib/db";
import { audit, type ActorType } from "@/lib/audit";
import { generatePlan, validatePlan, type LocationForPlan, type ValidatedMission } from "@/lib/ai/planner";
import { evaluatePlan, screenText, type AgentPolicy, type PolicyResult } from "@/lib/policy";

export type StoredPlan = {
  summary: string;
  missions: ValidatedMission[];
  assumptions: string[];
  warnings: string[];
  validationErrors: string[];
  usedFallback: boolean;
  fallbackReason?: string;
};

export type CreateObjectiveInput = {
  requesterId: string;
  requestText: string;
  budgetMinor: number;
  deadline: Date;
  actor: { type: ActorType; id: string };
  /** Set when an external AI agent submits on behalf of its principal (spec §9). */
  agent?: { id: string; policy: AgentPolicy; spentTodayMinor: number; region: string };
};

/** Agent limits that can be checked before spending a model call on planning. */
function agentPrecheck(input: CreateObjectiveInput): PolicyResult {
  const a = input.agent;
  if (!a) return { decision: "ALLOW", reasons: [] };
  const reasons: string[] = [];
  const remaining = a.policy.daily_limit_minor - a.spentTodayMinor;
  if (a.policy.expires_at && a.policy.expires_at.getTime() < Date.now()) reasons.push("The agent's credentials have expired.");
  if (a.region !== a.policy.allowed_region) reasons.push(`Region "${a.region}" is outside the agent's allowed region (${a.policy.allowed_region}).`);
  if (input.budgetMinor > remaining) {
    reasons.push(
      `Budget $${input.budgetMinor / 100} exceeds the agent's remaining daily limit ($${remaining / 100} of $${a.policy.daily_limit_minor / 100}).`,
    );
  }
  return reasons.length ? { decision: "REJECT", reasons } : { decision: "ALLOW", reasons: [] };
}

export async function listLocations(): Promise<LocationForPlan[]> {
  return db()<LocationForPlan[]>`
    select id, name, neighborhood, address_label, permission_note from locations order by id`;
}

/**
 * Intake → plan → validate → policy gate. Always records the objective and its plan (even when
 * rejected) so the refusal is visible in the UI and the audit log.
 */
export async function createObjective(input: CreateObjectiveInput): Promise<{ id: string; policy: PolicyResult }> {
  const sql = db();
  const [org] = await sql<{ organization_id: string }[]>`
    select organization_id from organization_members where user_id = ${input.requesterId} limit 1`;
  const [objective] = await sql<{ id: string }[]>`
    insert into objectives (requester_id, agent_id, organization_id, request_text, deadline, budget_minor, state, geo_scope)
    values (${input.requesterId}, ${input.agent?.id ?? null}, ${org?.organization_id ?? null}, ${input.requestText},
            ${input.deadline}, ${input.budgetMinor}, 'VALIDATING', 'charlotte_demo')
    returning id`;
  await audit(sql, {
    actorType: input.actor.type,
    actorId: input.actor.id,
    action: "objective.created",
    resourceType: "objective",
    resourceId: objective.id,
    afterState: "VALIDATING",
    metadata: { budget_minor: input.budgetMinor, via: input.agent ? "agent" : "web" },
  });

  // Screen the request (and an agent's spending limits) before spending a model call on it.
  const textScreen = screenText(input.requestText);
  const pre = agentPrecheck(input);
  const screen: PolicyResult =
    textScreen.decision === "REJECT" || pre.decision === "REJECT"
      ? { decision: "REJECT", reasons: [...textScreen.reasons, ...pre.reasons] }
      : textScreen;
  let stored: StoredPlan;
  let model: string;
  let policy: PolicyResult;

  if (screen.decision === "REJECT") {
    stored = { summary: "Request refused before planning.", missions: [], assumptions: [], warnings: [], validationErrors: [], usedFallback: false };
    model = "policy";
    policy = screen;
  } else {
    const locations = await listLocations();
    const planInput = { requestText: input.requestText, budgetMinor: input.budgetMinor, deadline: input.deadline, locations };
    const generated = await generatePlan(planInput);
    const { missions, errors } = validatePlan(generated.plan, planInput);
    stored = {
      summary: generated.plan.summary,
      missions,
      assumptions: generated.plan.assumptions,
      warnings: generated.plan.warnings,
      validationErrors: errors,
      usedFallback: generated.usedFallback,
      fallbackReason: generated.fallbackReason,
    };
    model = generated.model;
    policy = evaluatePlan({ requestText: input.requestText, budgetMinor: input.budgetMinor, missions }, input.agent);
    if (errors.length) policy = { decision: "REJECT", reasons: [...errors, ...policy.reasons.filter((r) => !errors.includes(r))] };
  }

  const rejected = policy.decision === "REJECT";
  const total = stored.missions.reduce((s, m) => s + m.reward_minor, 0);
  const nextState = rejected ? "REJECTED_POLICY" : "AWAITING_APPROVAL";

  await sql.begin(async (tx) => {
    await tx`
      insert into mission_plans (objective_id, version, plan_json, estimated_cost_minor, risk, model, approval_state)
      values (${objective.id}, 1, ${tx.json(stored as never)}, ${total}, ${tx.json(policy as never)}, ${model},
              ${rejected ? "REJECTED" : "PENDING"})`;
    await tx`update objectives set state = ${nextState}, updated_at = now() where id = ${objective.id}`;
    await audit(tx, {
      actorType: "system",
      actorId: "policy_guardian",
      action: rejected ? "policy.rejected" : "policy.passed",
      resourceType: "objective",
      resourceId: objective.id,
      beforeState: "VALIDATING",
      afterState: nextState,
      metadata: { decision: policy.decision, reasons: policy.reasons, model },
    });
  });

  return { id: objective.id, policy };
}

export class TransitionError extends Error {}

export type ObjectiveRow = {
  id: string;
  request_text: string;
  budget_minor: number;
  deadline: Date;
  state: string;
  agent_id: string | null;
  created_at: Date;
  mission_count: number;
};

export async function listObjectives(): Promise<ObjectiveRow[]> {
  return db()<ObjectiveRow[]>`
    select o.id, o.request_text, o.budget_minor, o.deadline, o.state, o.agent_id, o.created_at,
           (select count(*)::int from missions m where m.objective_id = o.id) as mission_count
    from objectives o order by o.created_at desc limit 20`;
}

export async function getObjective(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [objective] = await sql<(ObjectiveRow & { requester_id: string; requester_name: string })[]>`
    select o.*, u.display_name as requester_name,
           (select count(*)::int from missions m where m.objective_id = o.id) as mission_count
    from objectives o join users u on u.id = o.requester_id where o.id = ${id}`;
  if (!objective) return null;
  const [plan] = await sql<{ id: string; version: number; plan_json: StoredPlan; risk: PolicyResult; model: string; approval_state: string; estimated_cost_minor: number }[]>`
    select id, version, plan_json, risk, model, approval_state, estimated_cost_minor
    from mission_plans where objective_id = ${id} order by version desc limit 1`;
  const missions = await sql<{ id: string; title: string; category: string; state: string; reward_minor: number; location_name: string; operator_name: string | null }[]>`
    select m.id, m.title, m.category, m.state, m.reward_minor, l.name as location_name, u.display_name as operator_name
    from missions m
    left join locations l on l.id = m.location_id
    left join assignments a on a.mission_id = m.id and a.status not in ('WITHDRAWN', 'CANCELLED')
    left join users u on u.id = a.operator_id
    where m.objective_id = ${id} order by m.created_at`;
  const activity = await sql<{ id: number; actor_type: string; actor_id: string; action: string; after_state: string | null; created_at: Date }[]>`
    select id, actor_type, actor_id, action, after_state, created_at from audit_events
    where (resource_type = 'objective' and resource_id = ${id})
       or (resource_type = 'mission' and resource_id in (select id::text from missions where objective_id = ${id}))
    order by created_at desc, id desc limit 30`;
  return { objective, plan: plan ?? null, missions, activity };
}
