import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { resetDemoAction } from "@/app/actions/demo";
import { Card } from "@/components/ui";
import { currentPersona, hasChosenPersona, homeFor } from "@/lib/demo/personas";
import { getHealth, type HealthStatus } from "@/lib/health";

// Public landing page: what SIDEQUEST is, how it flows, and the way in (/start).

const OPERATOR_STEPS = [
  { step: "See missions near you", detail: "Short, paid tasks on a map, with the reward and distance up front." },
  { step: "Accept and go", detail: "Accepting is voluntary and exclusive: the first eligible operator gets it." },
  { step: "Snap the proof", detail: "AI checks your photos against the checklist and tells you what to reshoot." },
  { step: "Get paid", detail: "Once approved, your reward is paid out through PayPal." },
];

const REQUESTER_STEPS = [
  { step: "Describe the outcome", detail: "In plain English, or let your AI agent ask over MCP within its budget." },
  { step: "Approve the plan", detail: "AI splits it into local missions; PayPal holds the budget." },
  { step: "Review the proof", detail: "Photos arrive with an AI evaluation; you make the final call." },
  { step: "Pay and close", detail: "Each approved mission is paid; unused budget is released." },
];

export default function Landing() {
  return (
    <div className="space-y-12">
      <section className="space-y-5 pt-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">The real world has quests</p>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
          AI can plan the work. People nearby get it done. PayPal pays them.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          SIDEQUEST turns a business&apos;s goal into short local missions, verifies the photo proof with AI, and pays the
          people who did the work, with every dollar held and released through PayPal.
        </p>
        <Suspense fallback={<div className="h-12 w-48 rounded-lg bg-surface" />}>
          <GetStarted />
        </Suspense>
      </section>

      <section aria-labelledby="how-heading" className="space-y-5">
        <h2 id="how-heading" className="text-xl font-semibold">How it works</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FlowCard title="If you do missions" steps={OPERATOR_STEPS} />
          <FlowCard title="If you need things done" steps={REQUESTER_STEPS} />
        </div>
      </section>

      <section aria-labelledby="judges-heading" className="space-y-4 border-t border-surface-2 pt-8">
        <h2 id="judges-heading" className="text-sm font-semibold uppercase tracking-widest text-muted">For judges and testers</h2>
        <p className="text-sm text-muted">
          Everything runs in the PayPal sandbox with fictional brands, venues and people. Pick any profile on the sign-in page;
          there are no passwords.
        </p>
        <Suspense fallback={<p className="text-sm text-muted">Checking services…</p>}>
          <SystemStatus />
        </Suspense>
        <form action={resetDemoAction} className="flex flex-wrap items-center gap-3 text-sm">
          <button type="submit" className="rounded-lg border border-surface-2 px-3 py-1.5 text-muted hover:border-warning hover:text-warning">
            Reset demo
          </button>
          <span className="text-muted">Clears all objectives and missions, voids open sandbox holds, and reloads the seed data.</span>
        </form>
      </section>
    </div>
  );
}

function FlowCard({ title, steps }: { title: string; steps: { step: string; detail: string }[] }) {
  return (
    <Card className="space-y-4">
      <h3 className="font-semibold">{title}</h3>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.step} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs text-accent">{i + 1}</span>
            <span>
              <span className="block font-medium">{s.step}</span>
              <span className="block text-sm text-muted">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

async function GetStarted() {
  if (await hasChosenPersona()) {
    const p = await currentPersona();
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={homeFor(p)} className="rounded-lg bg-accent px-5 py-3 font-semibold text-background">
          Continue as {p.name}
        </Link>
        <Link href="/start" className="text-sm text-muted hover:text-foreground">Switch profile</Link>
      </div>
    );
  }
  return (
    <Link href="/start" className="inline-block rounded-lg bg-accent px-5 py-3 font-semibold text-background">
      Get started
    </Link>
  );
}

async function SystemStatus() {
  await connection();
  const health = await getHealth();
  const rows: { label: string; ok: boolean; value: string }[] = [
    {
      label: "Database",
      ok: health.database === "ok",
      value: describeDatabase(health),
    },
    {
      label: "PayPal sandbox",
      ok: health.paypal === "configured",
      value: health.paypal === "configured" ? "Credentials loaded" : "Not configured",
    },
    {
      label: "Operator payout accounts",
      ok: health.operatorPayoutAccounts === 2,
      value: `${health.operatorPayoutAccounts} of 2 set`,
    },
    {
      label: "AI model",
      ok: health.ai === "configured",
      value: health.ai === "configured" ? "Key loaded" : "Not configured",
    },
  ];
  return (
    <ul className="divide-y divide-surface-2 rounded-xl bg-surface">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span>{row.label}</span>
          <span className={row.ok ? "text-accent" : "text-warning"}>
            {row.ok ? "● " : "○ "}
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function describeDatabase(health: HealthStatus): string {
  if (health.database === "ok") return health.databaseDetail ?? "Connected";
  if (health.database === "error") return `Error: ${health.databaseDetail}`;
  return "Not configured";
}
