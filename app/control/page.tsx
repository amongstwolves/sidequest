import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ActivityGrid, LiveRefresh, MissionsGrid } from "@/components/MissionControl";
import { Card, Money } from "@/components/ui";
import { activityRows, controlSummary, missionRows } from "@/lib/control";
import { currentPersona } from "@/lib/demo/personas";

export default function MissionControlPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-muted">Every mission, proof review and PayPal transaction, and who did what.</p>
        </div>
        <LiveRefresh />
      </div>
      <Suspense fallback={<Card className="h-[40rem]" />}>
        <Control />
      </Suspense>
    </div>
  );
}

async function Control() {
  await connection();
  const persona = await currentPersona();
  if (persona.key !== "requester") {
    return (
      <Card>
        Mission Control is the requester&apos;s view. Switch to <strong>Requester</strong> at the top, or see{" "}
        <Link href="/discover" className="text-accent hover:underline">your missions</Link>.
      </Card>
    );
  }
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
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="space-y-1 !p-4">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="text-xl">{s.value}</dd>
            {s.hint && <dd className="text-xs text-muted">{s.hint}</dd>}
          </Card>
        ))}
      </dl>

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
