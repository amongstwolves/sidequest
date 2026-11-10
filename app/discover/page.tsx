import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AiBadge, Card, formatDeadline, Money, StateBadge } from "@/components/ui";
import { currentPersona } from "@/lib/demo/personas";
import { formatDistance } from "@/lib/geo";
import { missionFeed } from "@/lib/missions";

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Card className="h-64" />}>
        <Feed />
      </Suspense>
    </div>
  );
}

async function Feed() {
  await connection();
  const persona = await currentPersona();
  const isOperator = persona.key !== "requester";
  const feed = await missionFeed({ userId: persona.userId, isOperator });
  const mine = feed.filter((f) => f.mission.assignee_id === persona.userId);
  const open = feed.filter((f) => f.mission.assignee_id !== persona.userId);

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{isOperator ? "Missions near you" : "All missions"}</h1>
        <p className="text-muted">
          {isOperator
            ? `Acting as ${persona.name}. You only see missions you're eligible for: in range, with the right skills, before the deadline.`
            : "Every published mission and who accepted it. Switch to an operator role to see their view."}
        </p>
      </div>

      {isOperator && mine.length > 0 && (
        <section className="space-y-3" aria-labelledby="mine-heading">
          <h2 id="mine-heading" className="text-lg font-semibold">Your missions</h2>
          <MissionList items={mine} />
        </section>
      )}

      <section className="space-y-3" aria-labelledby="open-heading">
        {isOperator && <h2 id="open-heading" className="text-lg font-semibold">Open offers</h2>}
        {open.length === 0 ? (
          <Card className="text-muted">
            {isOperator ? "No open missions in your area right now." : "No missions yet. "}
            {!isOperator && <Link href="/objectives/new" className="text-accent hover:underline">Create an objective →</Link>}
          </Card>
        ) : (
          <MissionList items={open} />
        )}
      </section>
    </>
  );
}

function MissionList({ items }: { items: Awaited<ReturnType<typeof missionFeed>> }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map(({ mission: m, match }) => (
        <li key={m.id}>
          <Link href={`/missions/${m.id}`} className="block rounded-xl bg-surface p-4 transition-colors hover:bg-surface-2/60">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wider text-muted">{m.category}</span>
                  <AiBadge ai={m.ai_created} />
                </div>
                <p className="font-semibold">{m.title}</p>
                <p className="text-sm text-muted">
                  {m.location_name} · {m.neighborhood}
                  {match && ` · ${formatDistance(match.distanceMeters)}`}
                </p>
              </div>
              <Money minor={m.reward_minor} className="text-xl text-accent" />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>Due {formatDeadline(m.deadline)}</span>
              <StateBadge state={m.state} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
