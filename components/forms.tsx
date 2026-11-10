"use client";

import { useActionState, useState } from "react";
import { approvePlanAction, createObjectiveAction, type FormState } from "@/app/actions/objectives";
import { acceptMissionAction, type AcceptState } from "@/app/actions/missions";

const EXAMPLE =
  "Our new autumn counter display should be up at Café A and Café B. Get a photo of each display with the price card readable, plus the storefront so we know it's the right location.";

const input =
  "w-full rounded-lg border border-surface-2 bg-background px-3 py-2 text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none";

export function ObjectiveForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createObjectiveAction, {});
  const [text, setText] = useState("");
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="request" className="font-semibold">What needs to happen?</label>
          <button type="button" onClick={() => setText(EXAMPLE)} className="text-sm text-accent hover:underline">
            Use example
          </button>
        </div>
        <textarea
          id="request"
          name="request"
          required
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the outcome in plain English: where, what proof you need, and anything operators should know."
          className={input}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="budget" className="font-semibold">Maximum budget (USD)</label>
          <input id="budget" name="budget" required inputMode="decimal" defaultValue="75" className={input} />
          <p className="text-xs text-muted">Held through PayPal when you approve; unused funds are released.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="deadline_hours" className="font-semibold">Deadline</label>
          <select id="deadline_hours" name="deadline_hours" defaultValue="48" className={input}>
            <option value="24">Within 24 hours</option>
            <option value="48">Within 2 days</option>
            <option value="72">Within 3 days</option>
            <option value="168">Within a week</option>
          </select>
        </div>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-background disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Planning missions…" : "Plan missions"}
      </button>
      {pending && <p className="text-sm text-muted" aria-live="polite">Claude is drafting the plan; the policy check runs next. This takes up to a minute.</p>}
    </form>
  );
}

export function ApprovePlanButton({ objectiveId, totalLabel }: { objectiveId: string; totalLabel: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(approvePlanAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="objective_id" value={objectiveId} />
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-background disabled:opacity-60 sm:w-auto">
        {pending ? "Publishing…" : `Approve plan · ${totalLabel}`}
      </button>
      {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
    </form>
  );
}

export function AcceptMissionButton({ missionId }: { missionId: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptMissionAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="mission_id" value={missionId} />
      <button type="submit" disabled={pending || state.ok} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-background disabled:opacity-60 sm:w-auto">
        {pending ? "Accepting…" : "Accept mission"}
      </button>
      {state.error && <p role="alert" className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{state.error}</p>}
    </form>
  );
}
