"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const seenKey = (id: string) => `sq_paid_seen_${id}`;

/** One-time "you got paid" moment for the operator, shown the first time they see a paid mission. Add ?celebrate to replay it. */
export function PaidSheet({ missionId, amountMinor, missionTitle, payoutId }: { missionId: string; amountMinor: number; missionTitle: string; payoutId: string }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(0);

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

  useEffect(() => {
    if (!open) return;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start - 250) / dur);
      setShown(Math.round(amountMinor * (p <= 0 ? 0 : 1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, amountMinor]);

  if (!open) return null;
  const close = () => setOpen(false);
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="paid-title">
      <button aria-label="Close" onClick={close} className="sq-fade absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="sq-sheet relative w-full max-w-md rounded-t-3xl border border-surface-2 bg-surface px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 md:rounded-3xl md:pb-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-2 md:hidden" aria-hidden />
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <span className="sq-ring absolute inset-0 rounded-full bg-accent/40" aria-hidden />
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-accent">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path className="sq-draw text-background" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
        <p className="mt-5 text-center text-sm font-semibold uppercase tracking-widest text-accent">You got paid</p>
        <p id="paid-title" className="mt-1 text-center text-5xl font-extrabold tabular-nums">
          +${(shown / 100).toFixed(2)}
        </p>
        <p className="mt-2 text-center text-muted">Sent to your PayPal account</p>
        <dl className="mt-6 space-y-3 rounded-2xl bg-background/60 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Mission</dt><dd className="truncate text-right">{missionTitle}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">PayPal payout</dt><dd className="truncate font-mono text-xs">{payoutId}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Status</dt><dd className="font-semibold text-accent">Settled</dd></div>
        </dl>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={close} className="rounded-xl border border-surface-2 px-4 py-3 font-semibold">View receipt</button>
          <Link href="/discover" className="rounded-xl bg-accent px-4 py-3 text-center font-bold text-background">Find another</Link>
        </div>
      </div>
    </div>
  );
}
