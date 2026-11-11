import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AiBadge, Card, formatDeadline, Money, StateBadge } from "@/components/ui";
import { LazyMap, type MapPoint } from "@/components/map/LazyMap";
import { currentPersona, hasChosenPersona } from "@/lib/demo/personas";
import { formatDistance } from "@/lib/geo";
import { loadOperators, missionFeed, operatorEarnings, type FeedItem } from "@/lib/missions";
import { formatUsd } from "@/lib/money";

// Operator home: what's near me, what I'm doing, what I've been paid.

export default function OperatorHome() {
  return (
    <Suspense fallback={<Card className="h-96" />}>
      <Home />
    </Suspense>
  );
}

const IN_PROGRESS = ["ACCEPTED", "IN_PROGRESS", "EVIDENCE_SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAYMENT_FAILED"];

const NEXT_STEP: Record<string, string> = {
  ACCEPTED: "Go to the location and submit photos",
  IN_PROGRESS: "Submit your photos",
  CHANGES_REQUESTED: "Reshoot needed: see what to fix",
  EVIDENCE_SUBMITTED: "AI is evaluating your photos",
  UNDER_REVIEW: "Waiting for the requester to approve",
  APPROVED: "Approved: payment is on its way",
  PAYMENT_PENDING: "PayPal payout in progress",
  PAYMENT_FAILED: "Payment issue: the requester is retrying",
};

async function Home() {
  await connection();
  if (!(await hasChosenPersona())) redirect("/start");
  const persona = await currentPersona();
  if (persona.key === "requester") redirect("/control");

  const [feed, earnings, operators] = await Promise.all([
    missionFeed({ userId: persona.userId, isOperator: true }),
    operatorEarnings(persona.userId),
    loadOperators(),
  ]);
  const me = operators.find((o) => o.user_id === persona.userId)!;
  const nearby = feed.filter((f) => f.mission.assignee_id !== persona.userId);
  const mine = feed.filter((f) => f.mission.assignee_id === persona.userId);
  const active = mine.filter((f) => IN_PROGRESS.includes(f.mission.state));
  const paid = earnings.filter((e) => e.status === "PAID");
  const paidTotal = paid.reduce((s, e) => s + e.amount_minor, 0);
  const pendingTotal = active.reduce((s, f) => s + f.mission.reward_minor, 0);

  const points: MapPoint[] = [
    {
      id: me.user_id,
      lat: me.lat,
      lng: me.lng,
      kind: "operator",
      label: `You (${me.display_name})`,
      sub: `${(me.radius_meters / 1609.344).toFixed(1)} mi service area`,
      eligible: true,
      radius: me.radius_meters,
      highlight: true,
    },
    ...[...nearby, ...active].map(
      ({ mission: m, match }): MapPoint => ({
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        kind: "mission",
        label: m.title,
        sub: `${m.location_name}${match ? ` · ${formatDistance(match.distanceMeters)}` : ""}`,
        reward: formatUsd(m.reward_minor).replace(".00", ""),
        href: `/missions/${m.id}`,
      }),
    ),
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-2xl font-bold">{persona.name}</h1>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <Card className="space-y-1 !p-4">
            <dt className="text-xs text-muted">Paid out</dt>
            <dd><Money minor={paidTotal} className="text-xl text-accent" /></dd>
          </Card>
          <Card className="space-y-1 !p-4">
            <dt className="text-xs text-muted">In progress</dt>
            <dd><Money minor={pendingTotal} className="text-xl" /></dd>
          </Card>
          <Card className="space-y-1 !p-4">
            <dt className="text-xs text-muted">Near you</dt>
            <dd className="font-mono text-xl">{nearby.length}</dd>
          </Card>
        </dl>
      </section>

      {active.length > 0 && (
        <section className="space-y-3" aria-labelledby="active-heading">
          <h2 id="active-heading" className="text-lg font-semibold">In progress</h2>
          <ul className="space-y-3">
            {active.map(({ mission: m }) => (
              <li key={m.id}>
                <Link href={`/missions/${m.id}`} className="block rounded-xl border border-accent/30 bg-surface p-4 hover:bg-surface-2/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{m.title}</p>
                      <p className="text-sm text-muted">{m.location_name} · due {formatDeadline(m.deadline)}</p>
                    </div>
                    <Money minor={m.reward_minor} className="shrink-0 text-lg text-accent" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-sm ${m.state === "CHANGES_REQUESTED" ? "text-warning" : "text-foreground"}`}>
                      {NEXT_STEP[m.state] ?? "Open mission"} →
                    </span>
                    <StateBadge state={m.state} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="near-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="near-heading" className="text-lg font-semibold">Missions near you</h2>
          <Link href="/discover" className="text-sm text-accent hover:underline">Full map →</Link>
        </div>
        <LazyMap points={points} className="h-64 sm:h-80" />
        {nearby.length === 0 ? (
          <Card className="text-muted">No open missions in your area right now. New ones appear here as soon as a requester&apos;s PayPal hold is approved.</Card>
        ) : (
          <MissionCards items={nearby} />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="done-heading">
        <h2 id="done-heading" className="text-lg font-semibold">Completed</h2>
        {paid.length === 0 ? (
          <Card className="text-muted">Nothing paid yet. Completed missions and their PayPal payouts show up here.</Card>
        ) : (
          <ul className="divide-y divide-surface-2 rounded-xl bg-surface">
            {paid.map((e) => (
              <li key={e.mission_id}>
                <Link href={`/missions/${e.mission_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1">{e.title}</span>
                    <span className="block text-xs text-muted">
                      {e.location_name} · paid {formatDeadline(e.paid_at)}
                      {e.payout_item_id && <> · PayPal <span className="font-mono">{e.payout_item_id}</span></>}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Money minor={e.amount_minor} className="text-accent" />
                    <StateBadge state="PAID" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MissionCards({ items }: { items: FeedItem[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map(({ mission: m, match }) => (
        <li key={m.id}>
          <Link href={`/missions/${m.id}`} className="block rounded-xl bg-surface p-4 transition-colors hover:bg-surface-2/60">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wider text-muted">{m.category}</span>
                  <AiBadge ai={m.ai_created} />
                </div>
                <p className="font-semibold">{m.title}</p>
                <p className="text-sm text-muted">
                  {m.location_name}
                  {match && ` · ${formatDistance(match.distanceMeters)}`} · due {formatDeadline(m.deadline)}
                </p>
              </div>
              <Money minor={m.reward_minor} className="shrink-0 text-xl text-accent" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
