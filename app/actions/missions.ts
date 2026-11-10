"use server";

import { refresh } from "next/cache";
import { currentPersona } from "@/lib/demo/personas";
import { acceptMission } from "@/lib/missions";
import { TransitionError } from "@/lib/objectives";

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
