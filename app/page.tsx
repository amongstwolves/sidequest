import { connection } from "next/server";
import { Suspense } from "react";
import { currentPersona } from "@/lib/demo/personas";
import { getHealth, type HealthStatus } from "@/lib/health";

const FLOW = [
  { step: "Objective", detail: "A person or AI agent describes the outcome and budget." },
  { step: "Plan", detail: "AI splits it into local missions with rewards and proof rubrics." },
  { step: "Hold funds", detail: "Requester approves; PayPal authorizes the budget." },
  { step: "Accept", detail: "Nearby operators choose missions. No forced assignment." },
  { step: "Proof", detail: "AI checks photos against the rubric and asks for fixes." },
  { step: "Pay", detail: "Each approved mission is captured and paid out via PayPal." },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">The real world has quests</p>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
          AI can plan the work. SIDEQUEST gets it done in the physical world, and pays for it through PayPal.
        </h1>
        <Suspense fallback={<p className="text-muted">Loading your role…</p>}>
          <PersonaGreeting />
        </Suspense>
      </section>

      <section aria-labelledby="flow-heading" className="space-y-4">
        <h2 id="flow-heading" className="text-lg font-semibold">How a mission flows</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((item, i) => (
            <li key={item.step} className="rounded-xl bg-surface p-4">
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
              <p className="mt-1 font-semibold">{item.step}</p>
              <p className="mt-1 text-sm text-muted">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="status-heading" className="space-y-4">
        <h2 id="status-heading" className="text-lg font-semibold">System status</h2>
        <Suspense fallback={<p className="text-muted">Checking services…</p>}>
          <SystemStatus />
        </Suspense>
      </section>
    </div>
  );
}

async function PersonaGreeting() {
  const persona = await currentPersona();
  const hint =
    persona.key === "requester"
      ? "You're the brand. Next up: describe an objective and approve a plan."
      : "You're a local operator. Next up: browse nearby missions and accept one.";
  return (
    <p className="text-muted">
      Acting as <span className="font-semibold text-foreground">{persona.name}</span> ({persona.role}). {hint}
    </p>
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
