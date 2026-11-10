import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ApprovePlanButton } from "@/components/forms";
import { Card, formatDeadline, Money, StateBadge } from "@/components/ui";
import { currentPersona } from "@/lib/demo/personas";
import { formatUsd } from "@/lib/money";
import { getObjective, listLocations } from "@/lib/objectives";

export default function ObjectivePage({ params }: PageProps<"/objectives/[id]">) {
  return (
    <Suspense fallback={<Card className="h-96" />}>
      <Objective params={params} />
    </Suspense>
  );
}

const DECISION_STYLE: Record<string, string> = {
  ALLOW: "text-accent",
  ALLOW_WITH_CONDITIONS: "text-accent",
  REQUIRES_HUMAN_REVIEW: "text-warning",
  REJECT: "text-error",
};

async function Objective({ params }: Pick<PageProps<"/objectives/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const [data, persona, locations] = await Promise.all([getObjective(id), currentPersona(), listLocations()]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  if (!data) notFound();
  const { objective, plan, missions, activity } = data;
  const planMissions = plan?.plan_json.missions ?? [];
  const total = planMissions.reduce((s, m) => s + m.reward_minor, 0);
  const canApprove = objective.state === "AWAITING_APPROVAL" && persona.userId === objective.requester_id;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-sm text-muted hover:text-foreground">← Objectives</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Objective</h1>
          <StateBadge state={objective.state} />
        </div>
        <p className="max-w-3xl text-lg">&ldquo;{objective.request_text}&rdquo;</p>
        <p className="text-sm text-muted">
          {objective.requester_name} · budget <Money minor={objective.budget_minor} /> · due {formatDeadline(objective.deadline)}
        </p>
      </div>

      {plan && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Policy check</h2>
            <span className={`font-mono text-sm font-semibold ${DECISION_STYLE[plan.risk.decision] ?? ""}`}>
              {plan.risk.decision.replaceAll("_", " ")}
            </span>
          </div>
          {plan.risk.reasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {plan.risk.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </Card>
      )}

      {plan && planMissions.length > 0 && (
        <section className="space-y-3" aria-labelledby="plan-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plan-heading" className="text-lg font-semibold">Plan v{plan.version}</h2>
            <p className="text-sm text-muted">
              {plan.plan_json.usedFallback ? `Template plan (${plan.plan_json.fallbackReason})` : `Drafted by ${plan.model}`}
            </p>
          </div>
          <p className="text-muted">{plan.plan_json.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {planMissions.map((m, i) => (
              <Card key={i} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-muted">{m.category} · {locationName.get(m.location_id) ?? m.location_id}</p>
                    <p className="font-semibold">{m.title}</p>
                  </div>
                  <Money minor={m.reward_minor} className="text-lg text-accent" />
                </div>
                <p className="text-sm text-muted">{m.description}</p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Proof checklist</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {m.rubric.map((r) => <li key={r.id}>☐ {r.requirement}</li>)}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div><dt className="text-muted">Missions</dt><dd className="font-mono">{planMissions.length}</dd></div>
              <div><dt className="text-muted">Proposed rewards</dt><dd><Money minor={total} /></dd></div>
              <div><dt className="text-muted">Unspent budget</dt><dd><Money minor={Math.max(0, objective.budget_minor - total)} /></dd></div>
            </dl>
            {canApprove && <ApprovePlanButton objectiveId={objective.id} totalLabel={formatUsd(total)} />}
          </Card>
          {(plan.plan_json.assumptions.length > 0 || plan.plan_json.warnings.length > 0) && (
            <div className="grid gap-3 text-sm md:grid-cols-2">
              {plan.plan_json.assumptions.length > 0 && (
                <Card><p className="font-semibold">Assumptions</p><ul className="mt-1 list-disc pl-5 text-muted">{plan.plan_json.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></Card>
              )}
              {plan.plan_json.warnings.length > 0 && (
                <Card><p className="font-semibold text-warning">Warnings</p><ul className="mt-1 list-disc pl-5 text-muted">{plan.plan_json.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Card>
              )}
            </div>
          )}
        </section>
      )}

      {missions.length > 0 && (
        <section className="space-y-3" aria-labelledby="missions-heading">
          <h2 id="missions-heading" className="text-lg font-semibold">Live missions</h2>
          <ul className="divide-y divide-surface-2 rounded-xl bg-surface">
            {missions.map((m) => (
              <li key={m.id}>
                <Link href={`/missions/${m.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/50">
                  <span>
                    <span className="font-medium">{m.title}</span>
                    <span className="block text-sm text-muted">{m.location_name} · {m.operator_name ? `accepted by ${m.operator_name}` : "waiting for an operator"}</span>
                  </span>
                  <span className="flex items-center gap-3"><Money minor={m.reward_minor} /><StateBadge state={m.state} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-lg font-semibold">Activity</h2>
        <ol className="space-y-2 text-sm">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 text-muted">
              <span className="font-mono text-xs">{formatDeadline(a.created_at)}</span>
              <span className="text-foreground">{a.action}</span>
              <span>by {a.actor_type}</span>
              {a.after_state && <span>→ {a.after_state}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
