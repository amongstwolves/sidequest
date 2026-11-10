"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/** "Reset demo": reloads the seed (which truncates every table). Voiding open PayPal authorizations is added with the payment flow. */
export async function resetDemoAction(): Promise<void> {
  const seed = await readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
  await db().unsafe(seed);
  redirect("/");
}
