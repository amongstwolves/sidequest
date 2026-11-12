"use client";

import { useEffect, useState } from "react";

const seenKey = (id: string) => `sq_accepted_seen_${id}`;

/** One-time "It's yours" confirmation right after an operator accepts. Add ?celebrate to replay it. */
export function AcceptedSheet(props: { missionId: string; rewardLabel: string; locationName: string; address: string; due: string; checklist: string[] }) {
  const { missionId, rewardLabel, locationName, address, due, checklist } = props;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(seenKey(missionId)) === "1" && !new URLSearchParams(location.search).has("celebrate");
      localStorage.setItem(seenKey(missionId), "1");
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [missionId]);

  if (!open) return null;
  const close = () => setOpen(false);
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="accepted-title">
      <button aria-label="Close" onClick={close} className="sq-fade absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="sq-sheet relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-surface-2 bg-surface px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 md:rounded-3xl md:pb-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-2 md:hidden" aria-hidden />
        <div className="flex items-center gap-4">
          <div className="relative grid h-16 w-16 shrink-0 place-items-center">
            <span className="sq-ring absolute inset-0 rounded-full bg-accent/40" aria-hidden />
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-accent">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path className="sq-draw text-background" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Mission accepted</p>
            <p id="accepted-title" className="text-4xl font-extrabold leading-tight">It&apos;s yours.</p>
          </div>
        </div>
        <p className="mt-4 text-muted">
          <span className="font-semibold text-foreground">{rewardLabel}</span> is already held by PayPal for this mission. Finish by{" "}
          <span className="text-foreground">{due}</span>.
        </p>
        <ol className="mt-5 space-y-3">
          <Step n={1} title={`Go to ${locationName}`} detail={address} />
          <Step n={2} title={`Take ${checklist.length} photos`} detail={checklist.join(" · ")} />
          <Step n={3} title="Submit proof" detail="AI checks it in seconds; you get paid when the requester approves." />
        </ol>
        <button onClick={close} className="mt-6 w-full rounded-xl bg-accent px-4 py-3 font-bold text-background">
          Let&apos;s go
        </button>
      </div>
    </div>
  );
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/50 text-sm font-bold text-accent">{n}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="line-clamp-2 text-sm text-muted">{detail}</p>
      </div>
    </li>
  );
}
