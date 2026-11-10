"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { releaseHold } from "@/lib/payments/flow";

/** "Reset demo": voids open PayPal sandbox holds, then reloads the seed (which truncates every table). */
export async function resetDemoAction(): Promise<void> {
  const open = await db()<{ objective_id: string }[]>`
    select objective_id from funding_authorizations
    where state in ('AUTHORIZED', 'PARTIALLY_CAPTURED') and provider_authorization_id is not null`;
  for (const f of open) {
    try {
      await releaseHold(f.objective_id, "demo reset");
    } catch (err) {
      // A hold that can't be voided (e.g. already expired) must not block the reset.
      console.error("Could not void sandbox hold during reset", f.objective_id, err);
    }
  }
  const seed = await readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
  await db().unsafe(seed);
  redirect("/");
}
