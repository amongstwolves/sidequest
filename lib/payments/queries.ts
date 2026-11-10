import "server-only";
import { db } from "@/lib/db";

export type FundingView = {
  state: string;
  amount_minor: number;
  captured_minor: number;
  provider_order_id: string | null;
  provider_authorization_id: string | null;
};

export type LedgerRow = {
  id: string;
  operation: string;
  amount_minor: number | null;
  state: string;
  provider_order_id: string | null;
  provider_authorization_id: string | null;
  provider_capture_id: string | null;
  provider_payout_batch_id: string | null;
  provider_payout_item_id: string | null;
  mission_title: string | null;
  created_at: Date;
};

export async function getFunding(objectiveId: string): Promise<FundingView | null> {
  const [row] = await db()<FundingView[]>`
    select state, amount_minor, captured_minor, provider_order_id, provider_authorization_id
    from funding_authorizations where objective_id = ${objectiveId}`;
  return row ?? null;
}

export async function getLedger(objectiveId: string): Promise<LedgerRow[]> {
  return db()<LedgerRow[]>`
    select t.id, t.operation, t.amount_minor, t.state, t.provider_order_id, t.provider_authorization_id,
           t.provider_capture_id, t.provider_payout_batch_id, t.provider_payout_item_id, m.title as mission_title, t.created_at
    from payment_transactions t
    join funding_authorizations f on f.id = t.funding_id
    left join payment_obligations ob on ob.id = t.obligation_id
    left join assignments a on a.id = ob.assignment_id
    left join missions m on m.id = a.mission_id
    where f.objective_id = ${objectiveId}
    order by t.created_at, t.id`;
}

export type ObligationView = {
  id: string;
  status: string;
  amount_minor: number;
  capture_id: string | null;
  payout_batch_id: string | null;
  payout_item_id: string | null;
  payout_state: string | null;
};

export async function getObligationForMission(missionId: string): Promise<ObligationView | null> {
  const [row] = await db()<ObligationView[]>`
    select ob.id, ob.status, ob.amount_minor,
           cap.provider_capture_id as capture_id,
           po.provider_payout_batch_id as payout_batch_id, po.provider_payout_item_id as payout_item_id, po.state as payout_state
    from payment_obligations ob
    join assignments a on a.id = ob.assignment_id
    left join payment_transactions cap on cap.obligation_id = ob.id and cap.operation = 'CAPTURE'
    left join payment_transactions po on po.obligation_id = ob.id and po.operation = 'PAYOUT'
    where a.mission_id = ${missionId}
    order by ob.created_at desc limit 1`;
  return row ?? null;
}

/** The provider ID that best identifies a ledger row. */
export function providerId(row: LedgerRow): string {
  return (
    row.provider_payout_item_id ??
    row.provider_payout_batch_id ??
    row.provider_capture_id ??
    row.provider_authorization_id ??
    row.provider_order_id ??
    "—"
  );
}
