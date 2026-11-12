import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AcceptMissionButton, ApproveMissionButton, EvidenceUpload, PayoutAutoCheck, RetryPaymentButton } from "@/components/forms";
import { AiBadge, Card, formatDeadline, Money, StateBadge } from "@/components/ui";
import { currentPersona } from "@/lib/demo/personas";
import { formatDistance } from "@/lib/geo";
import { getMission, matchesFor } from "@/lib/missions";
import { formatUsd } from "@/lib/money";
import { getObligationForMission } from "@/lib/payments/queries";
import { getSubmissions, type Submission } from "@/lib/evidence";
import { LazyMap, type MapPoint } from "@/components/map/LazyMap";
import { PaidSheet } from "@/components/PaidSheet";

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
  const [matches, obligation, submissions] = await Promise.all([matchesFor(m), getObligationForMission(m.id), getSubmissions(m.id)]);
  const isOperator = persona.key !== "requester";
  const myMatch = matches.find((r) => r.operator.user_id === persona.userId);
  const mine = m.assignee_id === persona.userId;
  const canSeeProof = mine || persona.key === "requester";
  const canSubmit = mine && ["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(m.state);

  const showPaid = mine && m.state === "PAID" && obligation;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {showPaid && (
        <PaidSheet
          missionId={m.id}
          amountMinor={obligation.amount_minor}
          missionTitle={m.title}
          payoutId={obligation.payout_item_id ?? obligation.payout_batch_id ?? "—"}
        />
      )}
      <div className="space-y-5">
        <div className="space-y-2">
          <Link href={isOperator ? "/me" : `/objectives/${m.objective_id}`} className="text-sm text-muted hover:text-foreground">
            ← {isOperator ? "My missions" : "Objective"}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-muted">{m.category}</span>
            <AiBadge ai={m.ai_created} />
            <StateBadge state={m.state} />
          </div>
          <h1 className="text-2xl font-bold">{m.title}</h1>
          {mine && m.state === "ACCEPTED" && submissions.length === 0 && (
            <div className="sq-pop flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold text-background" aria-hidden>✓</span>
              <div>
                <p className="font-bold">It&apos;s yours.</p>
                <p className="text-sm text-muted">Next: go to {m.location_name} and take the {m.rubric_json.items.length} checklist photos below.</p>
              </div>
            </div>
          )}
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

        {canSeeProof && submissions.length > 0 && (
          <section className="space-y-3" aria-labelledby="proof-heading">
            <h2 id="proof-heading" className="text-lg font-semibold">Proof</h2>
            {submissions.map((sub) => <SubmissionCard key={sub.submissionNo} sub={sub} latest={sub === submissions[0]} />)}
          </section>
        )}

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
              canSubmit ? (
                <>
                  {m.state === "CHANGES_REQUESTED" && submissions[0]?.review?.operator_message && (
                    <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning">{submissions[0].review.operator_message}</p>
                  )}
                  <EvidenceUpload missionId={m.id} resubmit={m.state === "CHANGES_REQUESTED"} />
                </>
              ) : (
                <p className="text-accent">
                  {m.state === "PAID" ? "You were paid for this mission." : "Proof submitted. The requester reviews it next."}
                </p>
              )
            ) : m.state === "PUBLISHED" && myMatch?.eligible ? (
              <>
                <p>Accepting is voluntary and exclusive: the first eligible operator to accept gets it, at the reward shown.</p>
                <AcceptMissionButton
                  missionId={m.id}
                  amountLabel={formatUsd(m.reward_minor).replace(".00", "")}
                  meta={[myMatch && formatDistance(myMatch.distanceMeters), `due ${formatDeadline(m.deadline)}`].filter(Boolean).join(" · ")}
                />
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
        <LazyMap
          points={[
            { id: m.id, lat: m.lat, lng: m.lng, kind: "mission", label: m.title, sub: m.location_name, reward: formatUsd(m.reward_minor).replace(".00", ""), highlight: true },
            ...matches.map(
              (r): MapPoint => ({
                id: r.operator.user_id,
                lat: r.operator.lat,
                lng: r.operator.lng,
                kind: "operator",
                label: r.operator.display_name,
                sub: r.eligible ? `${formatDistance(r.distanceMeters)} · score ${r.score.toFixed(2)}` : `${formatDistance(r.distanceMeters)} · ${r.exclusion}`,
                eligible: r.eligible,
                radius: r.operator.radius_meters,
                highlight: r.operator.user_id === persona.userId,
              }),
            ),
          ]}
        />
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />Eligible operator (dashed: service area)</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-500" />Not eligible</span>
          {isOperator && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-300" />You</span>}
        </p>
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

const RESULT_STYLE: Record<string, string> = {
  PASS_RECOMMENDED: "bg-accent/15 text-accent",
  CHANGES_REQUESTED: "bg-warning/15 text-warning",
  INCONCLUSIVE: "bg-warning/15 text-warning",
  REVIEW_REQUIRED: "bg-surface-2 text-muted",
};
const MET_ICON = { yes: "✓", no: "✗", unclear: "?" } as const;
const MET_STYLE = { yes: "text-accent", no: "text-error", unclear: "text-warning" } as const;

function SubmissionCard({ sub, latest }: { sub: Submission; latest: boolean }) {
  const r = sub.review;
  return (
    <Card className={`space-y-3 ${latest ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Submission {sub.submissionNo}{latest ? "" : " (earlier)"}</p>
        {r && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RESULT_STYLE[r.result] ?? ""}`}>{r.result.replaceAll("_", " ").toLowerCase()}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sub.photoIds.map((id, i) => (
          <a key={id} href={`/api/evidence/${id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/evidence/${id}`} alt={`Proof photo ${i + 1} of submission ${sub.submissionNo}`} className="aspect-square w-full rounded-lg object-cover" />
          </a>
        ))}
      </div>
      {r && (
        <>
          <ul className="space-y-1.5 text-sm">
            {r.findings.map((f) => (
              <li key={f.requirement_id} className="flex gap-2">
                <span className={`w-4 shrink-0 font-bold ${MET_STYLE[f.met]}`} aria-label={f.met}>{MET_ICON[f.met]}</span>
                <span><span className="font-medium">{f.requirement}</span> <span className="text-muted">{f.note}</span></span>
              </li>
            ))}
          </ul>
          {r.privacy_concern && <p className="text-sm text-warning">Privacy: a face or personal detail appears in the photos.</p>}
          {r.summary && <p className="text-sm text-muted">{r.summary}</p>}
          <p className="text-xs text-muted">
            {r.model && r.model !== "none" ? "AI evaluation. " : ""}A recommendation only: photos can&apos;t prove when, where or by whom they were taken. The requester decides.
          </p>
        </>
      )}
    </Card>
  );
}
