import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ActivityGrid, LiveRefresh, MissionsGrid } from "@/components/MissionControl";
import { ObjectivesList } from "@/components/ObjectivesList";
import { Card, Money } from "@/components/ui";
import { activityRows, controlSummary, missionRows } from "@/lib/control";
import { currentPersona, hasChosenPersona } from "@/lib/demo/personas";

// Requester home: objectives, budget, live missions and the full activity trail.

export default function MissionControlPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-muted">Your objectives, every mission and PayPal transaction, and who did what.</p>
        </div>
        <div className="flex items-center gap-4">
          <LiveRefresh />
          <Link href="/objectives/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background">
            New objective
          </Link>
        </div>
      </div>
      <Suspense fallback={<Card className="h-[40rem]" />}>
        <Control />
      </Suspense>
    </div>
  );
}

async function Control() {
  await connection();
  if (!(await hasChosenPersona())) redirect("/start");
  const persona = await currentPersona();
  if (persona.key !== "requester") redirect("/me");
  const [summary, missions, activity] = await Promise.all([controlSummary(), missionRows(), activityRows()]);

  const stats: { label: string; value: React.ReactNode; hint?: string }[] = [
    { label: "Budget committed", value: <Money minor={summary.budgetMinor} />, hint: `${summary.objectives} objectives` },
    { label: "Held by PayPal", value: <Money minor={summary.heldMinor} />, hint: `${summary.awaitingApproval} awaiting approval` },
    { label: "Captured", value: <Money minor={summary.capturedMinor} /> },
    { label: "Paid to operators", value: <Money minor={summary.paidOutMinor} className="text-accent" />, hint: `${summary.missionsPaid} missions paid` },
    { label: "Released (voided)", value: <Money minor={summary.releasedMinor} /> },
    { label: "Refused by policy", value: <span className="font-mono">{summary.refused}</span>, hint: `${summary.missionsOpen} missions open` },
  ];

  return (
    <div className="space-y-8">
      {/* Phones: a swipeable strip of stat cards; larger screens: a grid. */}
      <dl className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">

        {stats.map((s) => (
          <Card key={s.label} className="min-w-[9.5rem] shrink-0 snap-start space-y-1 !p-4 sm:min-w-0">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="text-xl">{s.value}</dd>
            {s.hint && <dd className="text-xs text-muted">{s.hint}</dd>}
          </Card>
        ))}
      </dl>

      <section className="space-y-3" aria-labelledby="objectives-heading">
        <h2 id="objectives-heading" className="text-lg font-semibold">Objectives</h2>
        <Suspense fallback={<Card className="h-24" />}>
          <ObjectivesList />
        </Suspense>
      </section>

      <section className="space-y-3" aria-labelledby="missions-grid">
        <h2 id="missions-grid" className="text-lg font-semibold">Missions</h2>
        <MissionsGrid rows={missions} />
      </section>

      <section className="space-y-3" aria-labelledby="activity-grid">
        <h2 id="activity-grid" className="text-lg font-semibold">Activity log</h2>
        <ActivityGrid rows={activity} />
      </section>
      <p className="text-xs text-muted">PayPal sandbox. Amounts show as paid only after PayPal confirms the payout.</p>
    </div>
  );
}
