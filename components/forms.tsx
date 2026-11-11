"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { approvePlanAction, createObjectiveAction, type FormState } from "@/app/actions/objectives";
import { acceptMissionAction, approveMissionAction, retryPaymentAction, submitEvidenceAction, syncPayoutAction, type AcceptState, type ProofState } from "@/app/actions/missions";

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
      {pending && <p className="text-sm text-muted" aria-live="polite">AI is drafting the plan; the policy check runs next. This takes up to a minute.</p>}
    </form>
  );
}

export function ApprovePlanButton({ objectiveId, totalLabel }: { objectiveId: string; totalLabel: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(approvePlanAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="objective_id" value={objectiveId} />
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-background disabled:opacity-60 sm:w-auto">
        {pending ? "Opening PayPal…" : `Approve & hold ${totalLabel} with PayPal`}
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

export function ApproveMissionButton({ missionId, amountLabel }: { missionId: string; amountLabel: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(approveMissionAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="mission_id" value={missionId} />
      <button type="submit" disabled={pending || state.ok} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-background disabled:opacity-60 sm:w-auto">
        {pending ? "Capturing and paying out…" : `Approve & pay ${amountLabel}`}
      </button>
      {state.error && <p role="alert" className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{state.error}</p>}
    </form>
  );
}

export function RetryPaymentButton({ obligationId, label }: { obligationId: string; label: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(retryPaymentAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="obligation_id" value={obligationId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-surface-2 px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-60">
        {pending ? "Checking PayPal…" : label}
      </button>
      {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
    </form>
  );
}

/** Polls PayPal while a sandbox payout is pending (they usually settle within a minute). */
export function PayoutAutoCheck({ obligationId }: { obligationId: string }) {
  const [checks, setChecks] = useState(0);
  useEffect(() => {
    if (checks >= 24) return; // stop after ~2 minutes; the manual button remains
    const t = setTimeout(async () => {
      const settled = await syncPayoutAction(obligationId).catch(() => false);
      if (!settled) setChecks((c) => c + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [checks, obligationId]);
  return <p className="text-xs text-muted" aria-live="polite">Waiting for PayPal to confirm the payout… checking every 5 seconds.</p>;
}

// Fictional proof photos in public/demo-photos for judges testing without a real café.
const DEMO_PHOTOS = [
  { file: "storefront-a.jpg", label: "Café A storefront" },
  { file: "storefront-b.jpg", label: "Café B storefront" },
  { file: "display-no-price-card.jpg", label: "Display (no price card)" },
  { file: "price-card-closeup.jpg", label: "Price card close-up" },
];

/** Downscale to max 1600px JPEG in the browser so uploads stay small and EXIF location data is dropped. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read photo"))), "image/jpeg", 0.85),
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function EvidenceUpload({ missionId, resubmit }: { missionId: string; resubmit: boolean }) {
  const [state, action, pending] = useActionState<ProofState, FormData>(submitEvidenceAction, {});
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [prepError, setPrepError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(list: FileList | null) {
    setPrepError(null);
    if (!list) return;
    try {
      const picked = await Promise.all([...list].slice(0, 4).map(shrink));
      setPhotos(picked.map((file) => ({ file, url: URL.createObjectURL(file) })));
    } catch {
      setPrepError("One of those files couldn't be read as a photo.");
    }
  }

  return (
    <form
      action={(fd) => {
        fd.delete("photos");
        photos.forEach((p) => fd.append("photos", p.file));
        action(fd);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="mission_id" value={missionId} />
      <label className="block space-y-2">
        <span className="font-semibold">{resubmit ? "Upload corrected photos" : "Upload proof photos"}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => onPick(e.target.files)}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-foreground"
        />
        <span className="block text-xs text-muted">Up to 4 photos. They&apos;re resized on your device; location data is removed.</span>
      </label>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground">No café nearby? Use demo photos</summary>
        <p className="mt-2">Download, then pick them above. Submit without the price card first to see the AI ask for a reshoot.</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {DEMO_PHOTOS.map((p) => (
            <li key={p.file}>
              <a href={`/demo-photos/${p.file}`} download className="text-accent hover:underline">{p.label}</a>
            </li>
          ))}
        </ul>
      </details>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.url} src={p.url} alt="Selected proof photo" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )}
      {(prepError || state.error) && <p role="alert" className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{prepError ?? state.error}</p>}
      <button type="submit" disabled={pending || photos.length === 0} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-background disabled:opacity-60 sm:w-auto">
        {pending ? "AI is evaluating your photos…" : "Submit proof"}
      </button>
    </form>
  );
}
