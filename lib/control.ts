import "server-only";
import { db } from "@/lib/db";

// Data for requester Mission Control (spec §11.3): mission rows with PayPal IDs, the audit trail,
// and a budget summary. Plain JSON (ISO strings) so it can be handed to the client grids.

export type MissionGridRow = {
  id: string;
  objectiveId: string;
  objective: string;
  viaAgent: boolean;
  title: string;
  location: string | null;
  operator: string | null;
  state: string;
  review: string | null;
  rewardMinor: number;
  authorizationId: string | null;
  captureId: string | null;
  payoutItemId: string | null;
  paymentStatus: string | null;
  updatedAt: string;
};

export type ActivityGridRow = {
  id: number;
  at: string;
  actorType: "human" | "agent" | "system" | "provider";
  actor: string;
  action: string;
  subject: string;
  afterState: string | null;
  details: string;
};

export type ControlSummary = {
  objectives: number;
  awaitingApproval: number;
  refused: number;
  missionsOpen: number;
  missionsPaid: number;
  budgetMinor: number;
  heldMinor: number;
  capturedMinor: number;
  paidOutMinor: number;
  releasedMinor: number;
};

export async function missionRows(): Promise<MissionGridRow[]> {
  const rows = await db()<(Omit<MissionGridRow, "updatedAt"> & { updatedAt: Date })[]>`
    select m.id, m.objective_id as "objectiveId", o.request_text as objective, (o.agent_id is not null) as "viaAgent",
           m.title, l.name as location, u.display_name as operator, m.state,
           (select r.result from evidence_reviews r where r.mission_id = m.id order by r.created_at desc limit 1) as review,
           m.reward_minor as "rewardMinor",
           f.provider_authorization_id as "authorizationId",
           (select t.provider_capture_id from payment_transactions t where t.obligation_id = ob.id and t.operation = 'CAPTURE' limit 1) as "captureId",
           (select t.provider_payout_item_id from payment_transactions t where t.obligation_id = ob.id and t.operation = 'PAYOUT' limit 1) as "payoutItemId",
           ob.status as "paymentStatus", m.updated_at as "updatedAt"
    from missions m
    join objectives o on o.id = m.objective_id
    left join locations l on l.id = m.location_id
    left join assignments a on a.mission_id = m.id and a.status not in ('WITHDRAWN', 'CANCELLED')
    left join users u on u.id = a.operator_id
    left join payment_obligations ob on ob.assignment_id = a.id
    left join funding_authorizations f on f.objective_id = o.id
    order by m.created_at desc
    limit 200`;
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

const ACTOR_LABEL: Record<string, string> = {
  paypal: "PayPal",
  policy_guardian: "Policy check",
  mission_genesis: "Claude planner",
  proof_engine: "Claude proof review",
  orchestrator: "Orchestrator",
  payment_agent: "Payment agent",
  seed: "Demo seed",
  test: "Test harness",
};

function summarize(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
    .join(" · ")
    .slice(0, 240);
}

export async function activityRows(): Promise<ActivityGridRow[]> {
  const rows = await db()<{
    id: number;
    created_at: Date;
    actor_type: ActivityGridRow["actorType"];
    actor_id: string;
    actor_name: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    subject: string | null;
    after_state: string | null;
    metadata: Record<string, unknown> & { reasons?: string[] };
  }[]>`
    select e.id, e.created_at, e.actor_type, e.actor_id,
           coalesce(u.display_name, ap.name) as actor_name,
           e.action, e.resource_type, e.resource_id,
           coalesce(m.title, o.request_text) as subject,
           e.after_state, e.metadata
    from audit_events e
    left join users u on e.actor_type = 'human' and u.id::text = e.actor_id
    left join agent_principals ap on e.actor_type = 'agent' and ap.id::text = e.actor_id
    left join missions m on e.resource_type = 'mission' and m.id::text = e.resource_id
    left join objectives o on e.resource_type = 'objective' and o.id::text = e.resource_id
    order by e.created_at desc, e.id desc
    limit 500`;
  return rows.map((r) => ({
    id: r.id,
    at: r.created_at.toISOString(),
    actorType: r.actor_type,
    actor: r.actor_name ?? ACTOR_LABEL[r.actor_id] ?? r.actor_id,
    action: r.action,
    subject: r.subject ?? (r.resource_type === "model" ? `model ${r.resource_id}` : r.resource_type),
    afterState: r.after_state,
    details: [r.metadata.reasons?.join(" "), summarize(r.metadata)].filter(Boolean).join(" · "),
  }));
}

export async function controlSummary(): Promise<ControlSummary> {
  const [s] = await db()<ControlSummary[]>`
    select
      (select count(*)::int from objectives) as objectives,
      (select count(*)::int from objectives where state = 'AWAITING_APPROVAL') as "awaitingApproval",
      (select count(*)::int from objectives where state = 'REJECTED_POLICY') as refused,
      (select count(*)::int from missions where state not in ('PAID', 'CLOSED', 'CANCELLED', 'EXPIRED')) as "missionsOpen",
      (select count(*)::int from missions where state = 'PAID') as "missionsPaid",
      (select coalesce(sum(budget_minor), 0)::int from objectives where state not in ('REJECTED_POLICY', 'CANCELLED')) as "budgetMinor",
      (select coalesce(sum(amount_minor), 0)::int from funding_authorizations where state in ('AUTHORIZED', 'PARTIALLY_CAPTURED', 'CAPTURED', 'VOIDED')) as "heldMinor",
      (select coalesce(sum(captured_minor), 0)::int from funding_authorizations) as "capturedMinor",
      (select coalesce(sum(amount_minor), 0)::int from payment_obligations where status = 'PAID') as "paidOutMinor",
      (select coalesce(sum(amount_minor - captured_minor), 0)::int from funding_authorizations where state = 'VOIDED') as "releasedMinor"`;
  return s;
}
