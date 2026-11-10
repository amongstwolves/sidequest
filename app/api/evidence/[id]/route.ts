import { connection } from "next/server";
import { currentPersona } from "@/lib/demo/personas";
import { readEvidencePhoto } from "@/lib/evidence";

// Proof photos are private: only the mission's requester and its operator can load them.
export async function GET(_request: Request, ctx: RouteContext<"/api/evidence/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const persona = await currentPersona();
  const photo = await readEvidencePhoto(id, persona.userId);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
