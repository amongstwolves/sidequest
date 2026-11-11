import { Suspense } from "react";
import Link from "next/link";
import { ObjectiveForm } from "@/components/forms";
import { Card } from "@/components/ui";
import { currentPersona } from "@/lib/demo/personas";

export default function NewObjectivePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">New objective</h1>
        <p className="text-muted">
          Describe the outcome. AI splits it into local missions, then the policy check decides whether it can be published.
        </p>
      </div>
      <Suspense fallback={<Card className="h-64" />}>
        <RequesterOnly />
      </Suspense>
    </div>
  );
}

async function RequesterOnly() {
  const persona = await currentPersona();
  if (persona.key !== "requester") {
    return (
      <Card>
        <p>You&apos;re signed in as {persona.name}, an operator. Objectives are created by requesters.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/me" className="text-accent hover:underline">My missions →</Link>
          <Link href="/start" className="text-muted hover:text-foreground">Switch profile</Link>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <ObjectiveForm />
    </Card>
  );
}
