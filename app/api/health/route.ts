import { connection } from "next/server";
import { getHealth } from "@/lib/health";

// Always 200 so the host's health check passes while services are being configured;
// the body reports what is and isn't connected.
export async function GET() {
  await connection();
  return Response.json({ app: "ok", ...(await getHealth()) });
}
