import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { AgentPolicy } from "@/lib/policy";

// External AI requester (spec §3.4, §9). The demo has one agent principal, seeded in db/seed.sql,
// authenticated with MCP_AGENT_API_KEY. Policy is read from the database on every call and the
// agent has no tool that can change it (invariant 9: no self-escalation).

export const DEMO_AGENT_ID = "00000000-0000-4000-8000-00000000a6e1";
export const AGENT_REGION = "charlotte_demo";

export type AgentContext = {
  id: string;
  name: string;
  principalUserId: string;
  principalName: string;
  policy: AgentPolicy & { auto_publish: boolean; auto_release_payment: boolean };
  spentTodayMinor: number;
};

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time check of a Bearer token against MCP_AGENT_API_KEY. */
export function authenticateAgent(authorization: string | null): boolean {
  const expected = process.env.MCP_AGENT_API_KEY;
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(authorization.slice(7).trim()), digest(expected));
}

export async function loadAgent(agentId = DEMO_AGENT_ID): Promise<AgentContext | null> {
  const sql = db();
  const [row] = await sql<{
    id: string;
    name: string;
    status: string;
    principal_user_id: string;
    principal_name: string;
    daily_limit_minor: number;
    per_mission_limit_minor: number;
    allowed_categories: string[];
    allowed_region: string;
    requires_human_approval_above_minor: number;
    auto_publish: boolean;
    auto_release_payment: boolean;
    expires_at: Date | null;
  }[]>`
    select ap.id, ap.name, ap.status, ap.principal_user_id, u.display_name as principal_name,
           p.daily_limit_minor, p.per_mission_limit_minor, p.allowed_categories, p.allowed_region,
           p.requires_human_approval_above_minor, p.auto_publish, p.auto_release_payment, p.expires_at
    from agent_principals ap
    join users u on u.id = ap.principal_user_id
    join agent_policies p on p.agent_id = ap.id
    where ap.id = ${agentId}
    order by p.created_at desc limit 1`;
  if (!row || row.status !== "active") return null;

  // Committed today = budgets of today's objectives that weren't refused or cancelled.
  const [{ spent }] = await sql<{ spent: number }[]>`
    select coalesce(sum(budget_minor), 0)::int as spent from objectives
    where agent_id = ${agentId} and created_at >= date_trunc('day', now())
      and state not in ('REJECTED_POLICY', 'CANCELLED')`;

  return {
    id: row.id,
    name: row.name,
    principalUserId: row.principal_user_id,
    principalName: row.principal_name,
    policy: {
      daily_limit_minor: row.daily_limit_minor,
      per_mission_limit_minor: row.per_mission_limit_minor,
      allowed_categories: row.allowed_categories,
      allowed_region: row.allowed_region,
      requires_human_approval_above_minor: row.requires_human_approval_above_minor,
      expires_at: row.expires_at,
      auto_publish: row.auto_publish,
      auto_release_payment: row.auto_release_payment,
    },
    spentTodayMinor: spent,
  };
}
