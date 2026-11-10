import "server-only";
import { db, isDatabaseConfigured } from "@/lib/db";
import { isPayPalConfigured } from "@/lib/payments/paypal";

export type HealthStatus = {
  database: "ok" | "not_configured" | "error";
  databaseDetail?: string;
  paypal: "configured" | "not_configured";
  operatorPayoutAccounts: number;
  ai: "configured" | "not_configured";
};

export async function getHealth(): Promise<HealthStatus> {
  let database: HealthStatus["database"] = "not_configured";
  let databaseDetail: string | undefined;
  if (isDatabaseConfigured()) {
    try {
      const [row] = await db()`select count(*)::int as operators from operators`;
      database = "ok";
      databaseDetail = `${row.operators} seeded operators`;
    } catch (err) {
      database = "error";
      databaseDetail = err instanceof Error ? err.message.split("\n")[0] : "unknown error";
    }
  }
  return {
    database,
    databaseDetail,
    paypal: isPayPalConfigured() ? "configured" : "not_configured",
    operatorPayoutAccounts: [process.env.OPERATOR_A_EMAIL, process.env.OPERATOR_B_EMAIL].filter(Boolean).length,
    ai: process.env.AI_API_KEY ? "configured" : "not_configured",
  };
}
