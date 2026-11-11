import Link from "next/link";
import { connection } from "next/server";
import { Card, formatDeadline, Money, StateBadge } from "@/components/ui";
import { isDatabaseConfigured } from "@/lib/db";
import { listObjectives } from "@/lib/objectives";

/** The requester's objectives, newest first. Render inside <Suspense>. */
export async function ObjectivesList() {
  await connection();
  if (!isDatabaseConfigured()) return <Card className="text-muted">Database not configured.</Card>;
  const rows = await listObjectives();
  if (rows.length === 0) {
    return (
      <Card className="text-muted">
        No objectives yet. <Link href="/objectives/new" className="text-accent hover:underline">Describe one</Link> and AI will plan the missions.
      </Card>
    );
  }
  return (
    <ul className="divide-y divide-surface-2 rounded-xl bg-surface">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/objectives/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/50">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1">{o.request_text}</span>
              <span className="block text-sm text-muted">
                {o.agent_id ? "AI agent · " : ""}
                {o.mission_count} missions · due {formatDeadline(o.deadline)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <Money minor={o.budget_minor} />
              <StateBadge state={o.state} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
