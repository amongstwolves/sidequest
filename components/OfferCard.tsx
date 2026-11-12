import Link from "next/link";
import { AiBadge, formatDeadline } from "@/components/ui";
import { formatDistance } from "@/lib/geo";
import { formatUsd } from "@/lib/money";
import type { FeedItem } from "@/lib/missions";

/** "1d 4h left", "3h 20m left", "Expired". */
export function timeLeft(deadline: Date, now = Date.now()): string {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "Expired";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  return h > 0 ? `${h}h ${m % 60}m left` : `${m}m left`;
}

/** Mission offer, reward first: what it pays, how far, how long you have, what proof it takes. */
export function OfferCard({ item: { mission: m, match } }: { item: FeedItem }) {
  const photos = m.rubric_json.items.length;
  return (
    <Link
      href={`/missions/${m.id}`}
      className="group block overflow-hidden rounded-2xl border border-surface-2 bg-surface transition-colors hover:border-accent/50"
    >
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-3xl font-extrabold leading-none tracking-tight text-accent">{formatUsd(m.reward_minor).replace(".00", "")}</p>
          <span className="flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning" title={`Due ${formatDeadline(m.deadline)}`}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
            {timeLeft(m.deadline)}
          </span>
        </div>
        <div>
          <p className="font-semibold leading-snug">{m.title}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
            </svg>
            <span className="truncate">
              {match && <span className="font-semibold text-foreground">{formatDistance(match.distanceMeters)}</span>}
              {match && " · "}
              {m.location_name}
              {m.neighborhood ? ` · ${m.neighborhood}` : ""}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-muted">{m.category}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">{photos} photo{photos === 1 ? "" : "s"}</span>
          <AiBadge ai={m.ai_created} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-surface-2 bg-background/40 px-4 py-2.5 text-sm font-semibold text-accent">
        <span>View &amp; accept</span>
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

export function OfferList({ items }: { items: FeedItem[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((it) => (
        <li key={it.mission.id}>
          <OfferCard item={it} />
        </li>
      ))}
    </ul>
  );
}
