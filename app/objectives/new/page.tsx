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
          Describe the outcome. Claude splits it into local missions, then the policy check decides whether it can be published.
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
        <p>You&apos;re acting as {persona.name}, an operator. Switch to <strong>Requester</strong> at the top to create objectives.</p>
        <Link href="/discover" className="mt-3 inline-block text-accent hover:underline">See missions near you →</Link>
      </Card>
    );
  }
  return (
    <Card>
      <ObjectiveForm />
    </Card>
  );
}
