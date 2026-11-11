import { Suspense } from "react";
import { selectProfile, signOut } from "@/app/actions/persona";
import { Card } from "@/components/ui";
import { PERSONAS, currentPersona, hasChosenPersona } from "@/lib/demo/personas";

// Demo sign-in: choose a profile. No passwords; it sets the same profile cookie every page reads.

const DETAILS: Record<string, { tagline: string; area: string; does: string }> = {
  requester: {
    tagline: "Brand requester",
    area: "Runs an autumn display campaign",
    does: "Creates objectives, approves plans and PayPal holds, reviews proof and pays.",
  },
  operator_a: {
    tagline: "Local operator",
    area: "Northgate Mill · photo, retail displays",
    does: "Picks up nearby missions, submits photo proof, gets paid through PayPal.",
  },
  operator_b: {
    tagline: "Local operator",
    area: "Southline · photo, retail displays, events",
    does: "Picks up nearby missions, submits photo proof, gets paid through PayPal.",
  },
};

export default function StartPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Who are you?</h1>
        <p className="text-muted">Pick a demo profile to sign in. No password needed, and you can switch at any time.</p>
      </div>
      <Suspense fallback={<div className="h-72 rounded-xl bg-surface" />}>
        <Profiles />
      </Suspense>
    </div>
  );
}

async function Profiles() {
  const signedIn = await hasChosenPersona();
  const current = signedIn ? (await currentPersona()).key : null;
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-3">
        {PERSONAS.map((p) => {
          const d = DETAILS[p.key];
          const active = p.key === current;
          return (
            <li key={p.key}>
              <form action={selectProfile} className="h-full">
                <input type="hidden" name="persona" value={p.key} />
                <button
                  type="submit"
                  className={`flex h-full w-full flex-col gap-3 rounded-xl border p-5 text-left transition-colors ${
                    active ? "border-accent bg-surface" : "border-surface-2 bg-surface hover:border-accent/60"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-accent font-bold text-background" aria-hidden>
                      {p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-xs text-accent">{d.tagline}</span>
                    </span>
                  </span>
                  <span className="text-sm text-muted">{d.area}</span>
                  <span className="text-sm">{d.does}</span>
                  <span className="mt-auto pt-1 text-sm font-semibold text-accent">
                    {active ? "Signed in · continue →" : `Continue as ${p.key === "requester" ? p.name : p.name.split(" ")[0]} →`}
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {signedIn && (
        <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted">Done testing? Signing out returns you to the start page.</span>
          <form action={signOut}>
            <button type="submit" className="rounded-lg border border-surface-2 px-3 py-1.5 text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </Card>
      )}
    </>
  );
}
