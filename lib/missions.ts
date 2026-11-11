import "server-only";
import type { PendingQuery, Row } from "postgres";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rankOperators, type MatchResult, type OperatorForMatch } from "@/lib/matching";
import { TransitionError } from "@/lib/objectives";

export type MissionRow = {
  id: string;
  objective_id: string;
  title: string;
  description: string;
  category: string;
  state: string;
  reward_minor: number;
  currency: string;
  deadline: Date;
  lat: number;
  lng: number;
  required_capabilities: string[];
  rubric_json: { items: { id: string; requirement: string }[]; safety_notes?: string };
  ai_created: boolean;
  location_name: string;
  neighborhood: string;
  address_label: string;
  permission_note: string;
  requester_name: string;
  agent_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
};

const missionSelect = (where: PendingQuery<Row[]>) => db()<MissionRow[]>`
  select m.id, m.objective_id, m.title, m.description, m.category, m.state, m.reward_minor, m.currency, m.deadline,
         m.lat, m.lng, m.required_capabilities, m.rubric_json, m.ai_created,
         l.name as location_name, l.neighborhood, l.address_label, l.permission_note,
         ru.display_name as requester_name, ap.name as agent_name,
         a.operator_id as assignee_id, au.display_name as assignee_name
  from missions m
  join objectives o on o.id = m.objective_id
  join users ru on ru.id = o.requester_id
  left join agent_principals ap on ap.id = o.agent_id
  left join locations l on l.id = m.location_id
  left join assignments a on a.mission_id = m.id and a.status not in ('WITHDRAWN', 'CANCELLED')
  left join users au on au.id = a.operator_id
  ${where}
  order by m.deadline, m.created_at`;

export async function loadOperators(): Promise<OperatorForMatch[]> {
  const rows = await db()<OperatorForMatch[]>`
    select o.user_id, u.display_name, o.persona_key, o.availability, u.status, o.lat, o.lng, o.radius_meters,
           o.capabilities, o.reliability_score::float8 as reliability_score,
           (select count(*)::int from assignments a
             where a.operator_id = o.user_id and a.status in ('ACCEPTED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'CHANGES_REQUESTED')) as active_assignments
    from operators o join users u on u.id = o.user_id`;
  return rows;
}

export async function getMission(id: string): Promise<MissionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await missionSelect(db()`where m.id = ${id}`);
  return row ?? null;
}

/** Ranked operators for one mission, with exclusion reasons for the ineligible ones. */
export async function matchesFor(mission: MissionRow): Promise<MatchResult[]> {
  return rankOperators(mission, await loadOperators());
}

export type FeedItem = { mission: MissionRow; match: MatchResult | null };

/**
 * Mission feed. Operators see open missions they are eligible for (offers) plus their own
 * assignments; the requester sees every mission.
 */
export async function missionFeed(viewer: { userId: string; isOperator: boolean }): Promise<FeedItem[]> {
  const missions = await missionSelect(db()`where m.state not in ('DRAFT', 'CANCELLED')`);
  if (!viewer.isOperator) return missions.map((mission) => ({ mission, match: null }));

  const operators = await loadOperators();
  const me = operators.find((o) => o.user_id === viewer.userId);
  if (!me) return [];
  const feed: FeedItem[] = [];
  for (const mission of missions) {
    if (mission.assignee_id === viewer.userId) {
      feed.push({ mission, match: null });
      continue;
    }
    if (mission.state !== "PUBLISHED") continue;
    const match = rankOperators(mission, [me])[0];
    if (match.eligible) feed.push({ mission, match });
  }
  return feed;
}

/**
 * Voluntary, exclusive acceptance (spec §7.1 / invariant 2). The mission row is locked, eligibility is
 * re-checked server-side, and the partial unique index on assignments backs up the state check.
 */
export async function acceptMission(missionId: string, operatorUserId: string): Promise<void> {
  try {
    await db().begin(async (tx) => {
      const [m] = await tx<{ state: string; reward_minor: number; deadline: Date; lat: number; lng: number; required_capabilities: string[] }[]>`
        select state, reward_minor, deadline, lat, lng, required_capabilities from missions where id = ${missionId} for update`;
      if (!m) throw new TransitionError("Mission not found.");
      if (m.state !== "PUBLISHED") {
        throw new TransitionError(
          m.state === "ACCEPTED" ? "Another operator accepted this mission first." : `This mission is no longer open (${m.state}).`,
        );
      }
      const me = (await loadOperators()).find((o) => o.user_id === operatorUserId);
      if (!me) throw new TransitionError("Only operators can accept missions.");
      const match = rankOperators(m, [me])[0];
      if (!match.eligible) throw new TransitionError(`You're not eligible for this mission: ${match.exclusion}.`);

      await tx`
        insert into assignments (mission_id, operator_id, agreed_reward_minor)
        values (${missionId}, ${operatorUserId}, ${m.reward_minor})`;
      await tx`update missions set state = 'ACCEPTED', updated_at = now() where id = ${missionId} and state = 'PUBLISHED'`;
      await audit(tx, {
        actorType: "human",
        actorId: operatorUserId,
        action: "mission.accepted",
        resourceType: "mission",
        resourceId: missionId,
        beforeState: "PUBLISHED",
        afterState: "ACCEPTED",
        metadata: { agreed_reward_minor: m.reward_minor, score: Number(match.score.toFixed(3)) },
      });
    });
  } catch (err) {
    // Unique index on active assignments: a concurrent accept won.
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "23505") {
      throw new TransitionError("Another operator accepted this mission first.");
    }
    throw err;
  }
}

export type EarningRow = {
  mission_id: string;
  title: string;
  location_name: string | null;
  amount_minor: number;
  status: string;
  payout_item_id: string | null;
  paid_at: Date;
};

/** An operator's paid and in-flight payments, newest first (PAID only after PayPal confirms). */
export async function operatorEarnings(operatorId: string): Promise<EarningRow[]> {
  return db()<EarningRow[]>`
    select m.id as mission_id, m.title, l.name as location_name, ob.amount_minor, ob.status,
           (select t.provider_payout_item_id from payment_transactions t
             where t.obligation_id = ob.id and t.operation = 'PAYOUT' limit 1) as payout_item_id,
           ob.updated_at as paid_at
    from payment_obligations ob
    join assignments a on a.id = ob.assignment_id
    join missions m on m.id = a.mission_id
    left join locations l on l.id = m.location_id
    where ob.payee_id = ${operatorId}
    order by ob.updated_at desc`;
}
