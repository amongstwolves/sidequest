import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AcceptMissionButton, ApproveMissionButton, PayoutAutoCheck, RetryPaymentButton } from "@/components/forms";
import { AiBadge, Card, formatDeadline, Money, StateBadge } from "@/components/ui";
import { currentPersona } from "@/lib/demo/personas";
import { formatDistance } from "@/lib/geo";
import { getMission, matchesFor } from "@/lib/missions";
import { formatUsd } from "@/lib/money";
import { getObligationForMission } from "@/lib/payments/queries";

export default function MissionPage({ params }: PageProps<"/missions/[id]">) {
  return (
    <Suspense fallback={<Card className="h-96" />}>
      <Mission params={params} />
    </Suspense>
  );
}

async function Mission({ params }: Pick<PageProps<"/missions/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const [m, persona] = await Promise.all([getMission(id), currentPersona()]);
  if (!m) notFound();
  const [matches, obligation] = await Promise.all([matchesFor(m), getObligationForMission(m.id)]);
  const isOperator = persona.key !== "requester";
  const myMatch = matches.find((r) => r.operator.user_id === persona.userId);
  const mine = m.assignee_id === persona.userId;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <div className="space-y-2">
          <Link href={isOperator ? "/discover" : `/objectives/${m.objective_id}`} className="text-sm text-muted hover:text-foreground">
            ← {isOperator ? "Missions" : "Objective"}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-muted">{m.category}</span>
            <AiBadge ai={m.ai_created} />
            <StateBadge state={m.state} />
          </div>
          <h1 className="text-2xl font-bold">{m.title}</h1>
          <p className="text-muted">{m.description}</p>
        </div>

        <Card className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-sm text-muted">Reward</p><Money minor={m.reward_minor} className="text-2xl text-accent" /></div>
          <div><p className="text-sm text-muted">Due</p><p className="font-medium">{formatDeadline(m.deadline)}</p></div>
          <div>
            <p className="text-sm text-muted">Location</p>
            <p className="font-medium">{m.location_name}</p>
            <p className="text-sm text-muted">{m.address_label}{myMatch && ` · ${formatDistance(myMatch.distanceMeters)}`}</p>
          </div>
        </Card>

        <Card className="space-y-2">
          <h2 className="font-semibold">Proof checklist</h2>
          <ul className="space-y-1">
            {m.rubric_json.items.map((r) => <li key={r.id}>☐ {r.requirement}</li>)}
          </ul>
          {m.rubric_json.safety_notes && <p className="pt-2 text-sm text-warning">Safety: {m.rubric_json.safety_notes}</p>}
          <p className="pt-2 text-sm text-muted">Permission on file: {m.permission_note}</p>
        </Card>

        <p className="text-sm text-muted">
          Requested by {m.requester_name}
          {m.agent_name ? ` through its AI agent (${m.agent_name})` : ""}.
        </p>

        {!isOperator && ["EVIDENCE_SUBMITTED", "UNDER_REVIEW"].includes(m.state) && (
          <Card className="space-y-3">
            <p>Proof is in. Approving captures this mission&apos;s reward from the PayPal hold and pays {m.assignee_name} through PayPal Payouts.</p>
            <ApproveMissionButton missionId={m.id} amountLabel={formatUsd(m.reward_minor)} />
          </Card>
        )}

        {obligation && (
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Payment to {m.assignee_name}</h2>
              <StateBadge state={obligation.status} />
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted">Amount</dt><dd><Money minor={obligation.amount_minor} /></dd></div>
              <div className="min-w-0"><dt className="text-muted">PayPal capture</dt><dd className="truncate font-mono text-xs">{obligation.capture_id ?? "—"}</dd></div>
              <div className="min-w-0">
                <dt className="text-muted">PayPal payout</dt>
                <dd className="truncate font-mono text-xs">{obligation.payout_item_id ?? obligation.payout_batch_id ?? "—"}</dd>
                {obligation.payout_state && <dd className="font-mono text-xs text-muted">{obligation.payout_state}</dd>}
              </div>
            </dl>
            {obligation.status === "PAYOUT_PENDING" && <PayoutAutoCheck obligationId={obligation.id} />}
            {!isOperator && obligation.status === "PAYOUT_PENDING" && <RetryPaymentButton obligationId={obligation.id} label="Check payout status" />}
            {!isOperator && obligation.status === "PAYMENT_FAILED" && <RetryPaymentButton obligationId={obligation.id} label="Retry payment" />}
          </Card>
        )}

        {isOperator && (
          <Card className="space-y-3">
            {mine ? (
              <p className="text-accent">You accepted this mission. Proof upload opens in the next step of the build.</p>
            ) : m.state === "PUBLISHED" && myMatch?.eligible ? (
              <>
                <p>Accepting is voluntary and exclusive: the first eligible operator to accept gets it, at the reward shown.</p>
                <AcceptMissionButton missionId={m.id} />
              </>
            ) : m.state !== "PUBLISHED" ? (
              <p className="text-muted">{m.assignee_name ? `Accepted by ${m.assignee_name}.` : "No longer open."}</p>
            ) : (
              <p className="text-muted">You&apos;re not eligible: {myMatch?.exclusion}.</p>
            )}
          </Card>
        )}
      </div>

      <aside className="space-y-3" aria-labelledby="match-heading">
        <h2 id="match-heading" className="font-semibold">Operator matching</h2>
        <p className="text-sm text-muted">Ranked live: proximity 35%, availability 25%, skills 20%, reliability 10%, deadline fit 10%.</p>
        <ol className="space-y-2">
          {matches.map((r, i) => (
            <li key={r.operator.user_id} className={`rounded-lg p-3 text-sm ${r.eligible ? "bg-surface" : "bg-surface/40 text-muted"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {r.eligible ? `${i + 1}. ` : ""}{r.operator.display_name}
                  {r.operator.persona_key && <span className="ml-1 text-xs text-accent">({r.operator.persona_key === "operator_a" ? "Operator A" : "Operator B"})</span>}
                </span>
                <span className="font-mono">{r.eligible ? r.score.toFixed(2) : "—"}</span>
              </div>
              <p className="text-xs text-muted">
                {formatDistance(r.distanceMeters)} away{r.exclusion ? ` · ${r.exclusion}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
