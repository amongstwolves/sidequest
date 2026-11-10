import "server-only";
import type { Sql, TransactionSql } from "postgres";

export type ActorType = "human" | "agent" | "system" | "provider";

export type AuditInput = {
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: string | null;
  afterState?: string | null;
  metadata?: Record<string, unknown>;
};

/** Append-only audit trail. Pass the transaction handle when the event belongs to a state change. */
export async function audit(sql: Sql | TransactionSql, e: AuditInput): Promise<void> {
  await sql`
    insert into audit_events (actor_type, actor_id, action, resource_type, resource_id, before_state, after_state, metadata)
    values (${e.actorType}, ${e.actorId}, ${e.action}, ${e.resourceType}, ${e.resourceId},
            ${e.beforeState ?? null}, ${e.afterState ?? null}, ${sql.json((e.metadata ?? {}) as never)})
  `;
}
