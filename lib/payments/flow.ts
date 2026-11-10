import "server-only";
import type { TransactionSql } from "postgres";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PERSONAS, payoutReceiverFor } from "@/lib/demo/personas";
import { formatUsd } from "@/lib/money";
import { TransitionError, type StoredPlan } from "@/lib/objectives";
import {
  PayPalError,
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  createPayoutBatch,
  getPayoutBatch,
  voidAuthorization,
} from "@/lib/payments/paypal";

// Money flow (spec §10.1a). Each provider call is keyed for idempotency (PayPal-Request-Id plus a
// unique key in payment_transactions) and every result is recorded before the next step runs.
// State only advances on confirmed provider responses, never on a model's say-so.

type Funding = {
  id: string;
  objective_id: string;
  provider_order_id: string | null;
  provider_authorization_id: string | null;
  amount_minor: number;
  captured_minor: number;
  currency: string;
  state: string;
};

async function recordTxn(t: {
  fundingId?: string | null;
  obligationId?: string | null;
  operation: "ORDER_CREATE" | "AUTHORIZE" | "CAPTURE" | "VOID" | "PAYOUT";
  key: string;
  amountMinor?: number | null;
  orderId?: string | null;
  authorizationId?: string | null;
  captureId?: string | null;
  payoutBatchId?: string | null;
  payoutItemId?: string | null;
  debugId?: string | null;
  state: string;
}) {
  await db()`
    insert into payment_transactions (funding_id, obligation_id, operation, idempotency_key, amount_minor,
      provider_order_id, provider_authorization_id, provider_capture_id, provider_payout_batch_id,
      provider_payout_item_id, provider_debug_id, state)
    values (${t.fundingId ?? null}, ${t.obligationId ?? null}, ${t.operation}, ${t.key}, ${t.amountMinor ?? null},
      ${t.orderId ?? null}, ${t.authorizationId ?? null}, ${t.captureId ?? null}, ${t.payoutBatchId ?? null},
      ${t.payoutItemId ?? null}, ${t.debugId ?? null}, ${t.state})
    on conflict (idempotency_key) do update set
      state = excluded.state,
      provider_capture_id = coalesce(excluded.provider_capture_id, payment_transactions.provider_capture_id),
      provider_payout_item_id = coalesce(excluded.provider_payout_item_id, payment_transactions.provider_payout_item_id),
      updated_at = now()`;
}

async function existingTxn(key: string) {
  const [row] = await db()<{ state: string; provider_capture_id: string | null; provider_payout_batch_id: string | null }[]>`
    select state, provider_capture_id, provider_payout_batch_id from payment_transactions where idempotency_key = ${key}`;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// 1. Plan approved → create an AUTHORIZE order for the budget and send the requester to PayPal.
// ---------------------------------------------------------------------------

export async function startFunding(objectiveId: string, requesterId: string, baseUrl: string): Promise<string> {
  const sql = db();
  const [obj] = await sql<{ state: string; requester_id: string; budget_minor: number; currency: string; request_text: string }[]>`
    select state, requester_id, budget_minor, currency, request_text from objectives where id = ${objectiveId}`;
  if (!obj) throw new TransitionError("Objective not found.");
  if (obj.requester_id !== requesterId) throw new TransitionError("Only the requester can approve this plan.");
  if (obj.state !== "AWAITING_APPROVAL") throw new TransitionError(`Plan can't be approved from state ${obj.state}.`);

  const [plan] = await sql<{ estimated_cost_minor: number }[]>`
    select estimated_cost_minor from mission_plans where objective_id = ${objectiveId} and approval_state = 'PENDING'
    order by version desc limit 1`;
  if (!plan) throw new TransitionError("No pending plan.");

  // Hold the full budget: each approved mission captures its reward, and the unused remainder is voided.
  const [funding] = await sql<Funding[]>`
    insert into funding_authorizations (objective_id, amount_minor, currency, state)
    values (${objectiveId}, ${obj.budget_minor}, ${obj.currency}, 'CREATED')
    on conflict (objective_id) do update set updated_at = now()
    returning *`;
  if (funding.state !== "CREATED") throw new TransitionError("Funding for this objective is already in progress.");

  const key = `objective:${objectiveId}:order:v1`;
  const order = await createAuthorizeOrder({
    amountMinor: funding.amount_minor,
    currency: funding.currency,
    referenceId: objectiveId,
    description: `SIDEQUEST objective budget (sandbox): ${obj.request_text}`,
    returnUrl: `${baseUrl}/api/paypal/return?objective=${objectiveId}`,
    cancelUrl: `${baseUrl}/objectives/${objectiveId}?funding=cancelled`,
    idempotencyKey: key,
  });
  if (!order.approveUrl) throw new TransitionError("PayPal did not return an approval link.");

  await sql`update funding_authorizations set provider_order_id = ${order.orderId}, updated_at = now() where id = ${funding.id}`;
  await recordTxn({ fundingId: funding.id, operation: "ORDER_CREATE", key, amountMinor: funding.amount_minor, orderId: order.orderId, debugId: order.debugId, state: order.status });
  await audit(sql, {
    actorType: "human",
    actorId: requesterId,
    action: "funding.order_created",
    resourceType: "objective",
    resourceId: objectiveId,
    metadata: { order_id: order.orderId, amount: formatUsd(funding.amount_minor) },
  });
  return order.approveUrl;
}

// ---------------------------------------------------------------------------
// 2. Buyer approved in PayPal → authorize (funds held), then publish the missions.
// ---------------------------------------------------------------------------

export async function completeFunding(objectiveId: string, orderId: string): Promise<void> {
  const sql = db();
  const [funding] = await sql<Funding[]>`select * from funding_authorizations where objective_id = ${objectiveId}`;
  if (!funding || funding.provider_order_id !== orderId) throw new TransitionError("This PayPal order doesn't match the objective.");
  if (funding.state !== "CREATED") return; // already authorized: the return URL was revisited

  const key = `objective:${objectiveId}:authorize:v1`;
  const auth = await authorizeOrder(orderId, key);
  // The buyer approved the order in PayPal; reflect that on the order row.
  await recordTxn({ operation: "ORDER_CREATE", key: `objective:${objectiveId}:order:v1`, state: "APPROVED" });
  await recordTxn({ fundingId: funding.id, operation: "AUTHORIZE", key, amountMinor: auth.amountMinor, orderId, authorizationId: auth.authorizationId, debugId: auth.debugId, state: auth.status });
  if (auth.status !== "CREATED" && auth.status !== "PENDING") {
    await sql`update funding_authorizations set state = 'FAILED', updated_at = now() where id = ${funding.id}`;
    throw new TransitionError(`PayPal authorization status ${auth.status}.`);
  }

  await sql.begin(async (tx) => {
    await tx`
      update funding_authorizations set state = 'AUTHORIZED', provider_authorization_id = ${auth.authorizationId}, updated_at = now()
      where id = ${funding.id} and state = 'CREATED'`;
    await audit(tx, {
      actorType: "provider",
      actorId: "paypal",
      action: "funding.authorized",
      resourceType: "objective",
      resourceId: objectiveId,
      metadata: { authorization_id: auth.authorizationId, amount: formatUsd(auth.amountMinor), status: auth.status },
    });
    await publishMissions(tx, objectiveId);
  });
}

async function publishMissions(tx: TransactionSql, objectiveId: string) {
  const [obj] = await tx<{ state: string; deadline: Date }[]>`select state, deadline from objectives where id = ${objectiveId} for update`;
  if (obj.state !== "AWAITING_APPROVAL") return;
  const [plan] = await tx<{ id: string; plan_json: StoredPlan }[]>`
    select id, plan_json from mission_plans where objective_id = ${objectiveId} and approval_state = 'PENDING'
    order by version desc limit 1`;
  if (!plan) throw new TransitionError("No pending plan.");
  for (const m of plan.plan_json.missions) {
    await tx`
      insert into missions (objective_id, plan_id, category, title, description, location_id, lat, lng,
                            reward_minor, deadline, required_capabilities, rubric_json, state, ai_created)
      select ${objectiveId}, ${plan.id}, ${m.category}, ${m.title}, ${m.description}, l.id, l.lat, l.lng,
             ${m.reward_minor}, ${obj.deadline}, ${m.required_capabilities},
             ${tx.json({ items: m.rubric, safety_notes: m.safety_notes } as never)}, 'PUBLISHED', ${!plan.plan_json.usedFallback}
      from locations l where l.id = ${m.location_id}`;
  }
  await tx`update mission_plans set approval_state = 'APPROVED' where id = ${plan.id}`;
  await tx`update objectives set state = 'PUBLISHED', updated_at = now() where id = ${objectiveId}`;
  await audit(tx, {
    actorType: "system",
    actorId: "orchestrator",
    action: "plan.published",
    resourceType: "objective",
    resourceId: objectiveId,
    beforeState: "AWAITING_APPROVAL",
    afterState: "PUBLISHED",
    metadata: { missions: plan.plan_json.missions.length },
  });
}

// ---------------------------------------------------------------------------
// 3. Requester approves a completed mission → obligation → capture → payout.
// ---------------------------------------------------------------------------

const APPROVABLE = ["EVIDENCE_SUBMITTED", "UNDER_REVIEW"];

export async function approveMissionAndPay(missionId: string, requesterId: string): Promise<void> {
  const sql = db();
  let obligationId: string | undefined;
  await sql.begin(async (tx) => {
    const [m] = await tx<{ state: string; objective_id: string; requester_id: string }[]>`
      select m.state, m.objective_id, o.requester_id from missions m join objectives o on o.id = m.objective_id
      where m.id = ${missionId} for update of m`;
    if (!m) throw new TransitionError("Mission not found.");
    if (m.requester_id !== requesterId) throw new TransitionError("Only the requester can approve this mission.");
    if (!APPROVABLE.includes(m.state)) throw new TransitionError(`Mission can't be approved from state ${m.state}.`);
    const [a] = await tx<{ id: string; operator_id: string; agreed_reward_minor: number }[]>`
      select id, operator_id, agreed_reward_minor from assignments
      where mission_id = ${missionId} and status not in ('WITHDRAWN', 'CANCELLED')`;
    if (!a) throw new TransitionError("No active assignment.");

    await tx`update assignments set status = 'APPROVED', completed_at = now() where id = ${a.id}`;
    await tx`update missions set state = 'APPROVED', updated_at = now() where id = ${missionId}`;
    const [ob] = await tx<{ id: string }[]>`
      insert into payment_obligations (assignment_id, payer_id, payee_id, amount_minor, approval_state)
      values (${a.id}, ${requesterId}, ${a.operator_id}, ${a.agreed_reward_minor}, 'APPROVED')
      on conflict (assignment_id) do update set updated_at = now()
      returning id`;
    obligationId = ob.id;
    await audit(tx, {
      actorType: "human",
      actorId: requesterId,
      action: "mission.approved",
      resourceType: "mission",
      resourceId: missionId,
      beforeState: m.state,
      afterState: "APPROVED",
      metadata: { obligation_id: ob.id, amount: formatUsd(a.agreed_reward_minor) },
    });
  });
  await payObligation(obligationId!);
}

type ObligationCtx = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  payee_id: string;
  mission_id: string;
  mission_title: string;
  objective_id: string;
  funding_id: string;
  authorization_id: string;
};

async function obligationCtx(obligationId: string): Promise<ObligationCtx> {
  const [row] = await db()<ObligationCtx[]>`
    select ob.id, ob.status, ob.amount_minor, ob.currency, ob.payee_id, m.id as mission_id, m.title as mission_title,
           m.objective_id, f.id as funding_id, f.provider_authorization_id as authorization_id
    from payment_obligations ob
    join assignments a on a.id = ob.assignment_id
    join missions m on m.id = a.mission_id
    join funding_authorizations f on f.objective_id = m.objective_id
    where ob.id = ${obligationId}`;
  if (!row) throw new TransitionError("Obligation or funding not found.");
  if (!row.authorization_id) throw new TransitionError("The objective has no PayPal authorization.");
  return row;
}

/** Idempotent: safe to call again after any failure; completed steps are skipped. */
export async function payObligation(obligationId: string): Promise<void> {
  const sql = db();
  const ob = await obligationCtx(obligationId);

  // Capture this mission's reward from the held authorization (never the operator payout itself).
  if (ob.status === "PENDING" || ob.status === "PAYMENT_FAILED") {
    const key = `obligation:${ob.id}:capture:v1`;
    const prior = await existingTxn(key);
    if (!prior?.provider_capture_id) {
      try {
        const cap = await captureAuthorization({
          authorizationId: ob.authorization_id,
          amountMinor: ob.amount_minor,
          currency: ob.currency,
          finalCapture: false,
          idempotencyKey: key,
        });
        await recordTxn({ fundingId: ob.funding_id, obligationId: ob.id, operation: "CAPTURE", key, amountMinor: ob.amount_minor, authorizationId: ob.authorization_id, captureId: cap.captureId, debugId: cap.debugId, state: cap.status });
        await sql.begin(async (tx) => {
          await tx`
            update funding_authorizations
            set captured_minor = captured_minor + ${ob.amount_minor}, state = 'PARTIALLY_CAPTURED', updated_at = now()
            where id = ${ob.funding_id}`;
          await tx`update payment_obligations set status = 'CAPTURED', updated_at = now() where id = ${ob.id}`;
          await tx`update missions set state = 'PAYMENT_PENDING', updated_at = now() where id = ${ob.mission_id}`;
          await audit(tx, {
            actorType: "provider",
            actorId: "paypal",
            action: "payment.captured",
            resourceType: "mission",
            resourceId: ob.mission_id,
            afterState: "PAYMENT_PENDING",
            metadata: { capture_id: cap.captureId, amount: formatUsd(ob.amount_minor), status: cap.status },
          });
        });
      } catch (err) {
        await markFailed(ob, err);
        throw err;
      }
    } else {
      await sql`update payment_obligations set status = 'CAPTURED', updated_at = now() where id = ${ob.id} and status <> 'PAID'`;
    }
  }

  // Pay the operator through the Payouts API.
  const persona = PERSONAS.find((p) => p.userId === ob.payee_id);
  const receiver = persona ? payoutReceiverFor(persona) : null;
  const key = `obligation:${ob.id}:payout:v1`;
  const prior = await existingTxn(key);
  if (!prior) {
    if (!receiver) {
      await markFailed(ob, new Error("Operator has no payout account on file."));
      throw new TransitionError("This operator has no PayPal payout account on file.");
    }
    try {
      // sender_batch_id must be unique per batch; the obligation id makes it so.
      const batch = await createPayoutBatch(`sq-${ob.id}`, [
        { receiverEmail: receiver, amountMinor: ob.amount_minor, currency: ob.currency, senderItemId: ob.id, note: `SIDEQUEST mission: ${ob.mission_title}` },
      ]);
      await recordTxn({ fundingId: ob.funding_id, obligationId: ob.id, operation: "PAYOUT", key, amountMinor: ob.amount_minor, payoutBatchId: batch.payoutBatchId, debugId: batch.debugId, state: batch.batchStatus });
      await sql`update payment_obligations set status = 'PAYOUT_PENDING', updated_at = now() where id = ${ob.id}`;
      await audit(sql, {
        actorType: "provider",
        actorId: "paypal",
        action: "payout.created",
        resourceType: "mission",
        resourceId: ob.mission_id,
        metadata: { payout_batch_id: batch.payoutBatchId, amount: formatUsd(ob.amount_minor), receiver: persona?.role },
      });
    } catch (err) {
      await markFailed(ob, err);
      throw err;
    }
  }

  // Sandbox batches usually settle within seconds; check a few times, then leave it for "Refresh status".
  for (let i = 0; i < 2; i++) {
    if (await syncPayout(ob.id)) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
}

async function markFailed(ob: ObligationCtx, err: unknown) {
  const message = err instanceof PayPalError ? `${err.message} (${err.issue ?? err.status})` : err instanceof Error ? err.message : "unknown error";
  await db()`update payment_obligations set status = 'PAYMENT_FAILED', updated_at = now() where id = ${ob.id}`;
  await db()`update missions set state = 'PAYMENT_FAILED', updated_at = now() where id = ${ob.mission_id}`;
  await audit(db(), { actorType: "system", actorId: "payment_agent", action: "payment.failed", resourceType: "mission", resourceId: ob.mission_id, afterState: "PAYMENT_FAILED", metadata: { error: message } });
}

/** Checks the payout batch; marks the mission PAID only on a provider SUCCESS. Returns true when settled. */
export async function syncPayout(obligationId: string): Promise<boolean> {
  const sql = db();
  const ob = await obligationCtx(obligationId);
  if (ob.status === "PAID") return true;
  const txn = await existingTxn(`obligation:${ob.id}:payout:v1`);
  if (!txn?.provider_payout_batch_id) return false;

  const batch = await getPayoutBatch(txn.provider_payout_batch_id);
  const item = batch.items.find((i) => i.senderItemId === ob.id);
  if (!item) return false;
  await recordTxn({ operation: "PAYOUT", key: `obligation:${ob.id}:payout:v1`, payoutItemId: item.payoutItemId, state: item.transactionStatus });
  if (item.transactionStatus !== "SUCCESS") return false;

  await sql.begin(async (tx) => {
    await tx`update payment_obligations set status = 'PAID', updated_at = now() where id = ${ob.id}`;
    await tx`update missions set state = 'PAID', updated_at = now() where id = ${ob.mission_id}`;
    await audit(tx, {
      actorType: "provider",
      actorId: "paypal",
      action: "payout.succeeded",
      resourceType: "mission",
      resourceId: ob.mission_id,
      afterState: "PAID",
      metadata: { payout_item_id: item.payoutItemId, amount: formatUsd(ob.amount_minor) },
    });
  });
  await maybeCloseObjective(ob.objective_id);
  return true;
}

// ---------------------------------------------------------------------------
// 4. Every mission settled → void the unused part of the hold and complete the objective.
// ---------------------------------------------------------------------------

const SETTLED = ["PAID", "CANCELLED", "EXPIRED", "CLOSED"];

export async function maybeCloseObjective(objectiveId: string): Promise<void> {
  const sql = db();
  const missions = await sql<{ state: string }[]>`select state from missions where objective_id = ${objectiveId}`;
  if (missions.length === 0 || !missions.every((m) => SETTLED.includes(m.state))) return;
  await releaseHold(objectiveId, "objective completed");
  const [obj] = await sql<{ state: string }[]>`select state from objectives where id = ${objectiveId}`;
  if (obj.state === "COMPLETED") return;
  await sql`update objectives set state = 'COMPLETED', updated_at = now() where id = ${objectiveId}`;
  await audit(sql, { actorType: "system", actorId: "orchestrator", action: "objective.completed", resourceType: "objective", resourceId: objectiveId, beforeState: obj.state, afterState: "COMPLETED" });
}

/** Voids whatever is still held on the authorization (unused budget). Safe to call repeatedly. */
export async function releaseHold(objectiveId: string, reason: string): Promise<void> {
  const sql = db();
  const [f] = await sql<Funding[]>`select * from funding_authorizations where objective_id = ${objectiveId}`;
  if (!f || !f.provider_authorization_id || !["AUTHORIZED", "PARTIALLY_CAPTURED"].includes(f.state)) return;
  const released = f.amount_minor - f.captured_minor;
  if (released <= 0) {
    await sql`update funding_authorizations set state = 'CAPTURED', updated_at = now() where id = ${f.id}`;
    return;
  }
  const key = `objective:${objectiveId}:void:v1`;
  const { debugId } = await voidAuthorization(f.provider_authorization_id, key);
  await recordTxn({ fundingId: f.id, operation: "VOID", key, amountMinor: released, authorizationId: f.provider_authorization_id, debugId, state: "VOIDED" });
  await sql`update funding_authorizations set state = 'VOIDED', updated_at = now() where id = ${f.id}`;
  await audit(sql, {
    actorType: "provider",
    actorId: "paypal",
    action: "funding.voided",
    resourceType: "objective",
    resourceId: objectiveId,
    metadata: { authorization_id: f.provider_authorization_id, released: formatUsd(released), reason },
  });
}
