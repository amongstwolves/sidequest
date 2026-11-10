"use server";

import { refresh } from "next/cache";
import { currentPersona } from "@/lib/demo/personas";
import { acceptMission } from "@/lib/missions";
import { TransitionError } from "@/lib/objectives";
import { PayPalError } from "@/lib/payments/paypal";
import { approveMissionAndPay, payObligation, syncPayout } from "@/lib/payments/flow";

export type AcceptState = { error?: string; ok?: boolean };

export async function acceptMissionAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const persona = await currentPersona();
  if (persona.key === "requester") return { error: "Switch to an operator role to accept missions." };
  try {
    await acceptMission(String(formData.get("mission_id") ?? ""), persona.userId);
  } catch (err) {
    if (err instanceof TransitionError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: true };
}

export async function approveMissionAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const persona = await currentPersona();
  try {
    await approveMissionAndPay(String(formData.get("mission_id") ?? ""), persona.userId);
  } catch (err) {
    if (err instanceof TransitionError) return { error: err.message };
    if (err instanceof PayPalError) return { error: `PayPal: ${err.message}` };
    throw err;
  }
  refresh();
  return { ok: true };
}

/** Re-checks a pending payout, or retries a failed capture/payout (each step is idempotent). */
export async function retryPaymentAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const persona = await currentPersona();
  if (persona.key !== "requester") return { error: "Only the requester can retry payments." };
  try {
    await payObligation(String(formData.get("obligation_id") ?? ""));
  } catch (err) {
    if (err instanceof TransitionError) return { error: err.message };
    if (err instanceof PayPalError) return { error: `PayPal: ${err.message}` };
    throw err;
  }
  refresh();
  return { ok: true };
}

/** Read-only status check of a pending payout (no new captures or payouts). Safe from any role. */
export async function syncPayoutAction(obligationId: string): Promise<boolean> {
  const settled = await syncPayout(obligationId);
  if (settled) refresh();
  return settled;
}
