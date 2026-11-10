"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { currentPersona } from "@/lib/demo/personas";
import { approvePlan, createObjective, TransitionError } from "@/lib/objectives";
import { toMinor } from "@/lib/money";

export type FormState = { error?: string };

export async function createObjectiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const persona = await currentPersona();
  if (persona.key !== "requester") return { error: "Switch to the Requester role to create objectives." };

  const requestText = String(formData.get("request") ?? "").trim();
  const budgetRaw = String(formData.get("budget") ?? "").replace(/[$,\s]/g, "");
  const hours = Number(formData.get("deadline_hours") ?? 48);

  if (requestText.length < 15) return { error: "Describe the objective in at least a sentence." };
  if (requestText.length > 2000) return { error: "Keep the objective under 2,000 characters." };
  let budgetMinor: number;
  try {
    budgetMinor = toMinor(budgetRaw);
  } catch {
    return { error: "Enter the budget as a dollar amount, like 75 or 75.00." };
  }
  if (budgetMinor < 500) return { error: "The budget must be at least $5." };
  if (![24, 48, 72, 168].includes(hours)) return { error: "Pick a deadline." };

  const { id } = await createObjective({
    requesterId: persona.userId,
    requestText,
    budgetMinor,
    deadline: new Date(Date.now() + hours * 3_600_000),
    actor: { type: "human", id: persona.userId },
  });
  redirect(`/objectives/${id}`);
}

export async function approvePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const persona = await currentPersona();
  const objectiveId = String(formData.get("objective_id") ?? "");
  try {
    await approvePlan(objectiveId, persona.userId, { type: "human", id: persona.userId });
  } catch (err) {
    if (err instanceof TransitionError) return { error: err.message };
    throw err;
  }
  refresh();
  return {};
}
