import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai/planner";

// Proof Engine (spec §8.6). Claude compares photos with the mission's rubric, one finding per
// requirement. The overall result is derived from the findings in code, not taken from the model,
// and it only *recommends*: a human approves before any money moves.

const ReviewSchema = z.object({
  findings: z.array(
    z.object({
      requirement_id: z.string(),
      met: z.enum(["yes", "no", "unclear"]),
      note: z.string().describe("One short sentence citing what is or isn't visible."),
    }),
  ),
  privacy_concern: z.boolean().describe("True if a person's face, a license plate or other personal data is clearly visible."),
  summary: z.string().describe("One or two sentences for the requester."),
  operator_message: z.string().describe("What the operator should fix, or a short thank-you if everything is met."),
});

export type ReviewResult = "PASS_RECOMMENDED" | "CHANGES_REQUESTED" | "INCONCLUSIVE" | "REVIEW_REQUIRED";

export type Review = {
  result: ReviewResult;
  findings: { requirement_id: string; requirement: string; met: "yes" | "no" | "unclear"; note: string }[];
  privacyConcern: boolean;
  summary: string;
  operatorMessage: string;
  model: string;
};

export type ReviewInput = {
  missionTitle: string;
  missionDescription: string;
  locationName: string;
  permissionNote: string;
  rubric: { id: string; requirement: string }[];
  photos: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[];
};

const SYSTEM_PROMPT = `You review photo proof for SIDEQUEST, where local operators complete short paid verification missions.

For each rubric requirement, decide from the photos alone whether it is met: "yes" if clearly visible, "no" if clearly missing or contradicted, "unclear" if the photos can't show it (blurry, cropped, too dark). Cite what you see. Don't assume anything outside the frame, and don't reward effort: judge only what the photos show.

Flag privacy_concern if a recognizable face, a license plate or other personal data is clearly visible; operators were told not to capture these.

Photos can't prove when or where they were taken or who took them. Your review is a recommendation to the requester, who makes the final call.

Write operator_message directly to the operator: if anything is "no" or "unclear", say exactly what to reshoot. In summary and operator_message, describe requirements in words; never mention requirement ids.`;

function visionModel(): string {
  return process.env.AI_VISION_MODEL || "claude-opus-5-5";
}

function deriveResult(findings: Review["findings"], privacyConcern: boolean): ReviewResult {
  if (findings.some((f) => f.met === "no") || privacyConcern) return "CHANGES_REQUESTED";
  if (findings.some((f) => f.met === "unclear")) return "INCONCLUSIVE";
  return "PASS_RECOMMENDED";
}

function humanReview(input: ReviewInput, reason: string): Review {
  return {
    result: "REVIEW_REQUIRED",
    findings: input.rubric.map((r) => ({ requirement_id: r.id, requirement: r.requirement, met: "unclear" as const, note: "Not reviewed automatically." })),
    privacyConcern: false,
    summary: `Automatic review unavailable (${reason}). Please check the photos yourself.`,
    operatorMessage: "Thanks, your photos were submitted and are waiting for the requester's review.",
    model: "none",
  };
}

export async function reviewEvidence(input: ReviewInput): Promise<Review> {
  if (!isAiConfigured()) return humanReview(input, "AI key not configured");
  const [{ n }] = await db()<{ n: number }[]>`
    select count(*)::int as n from audit_events where action like 'ai.%' and created_at >= date_trunc('day', now())`;
  if (n >= Number(process.env.AI_DAILY_CALL_LIMIT || 200)) return humanReview(input, "daily AI limit reached");

  const client = new Anthropic({ apiKey: process.env.AI_API_KEY, timeout: 90_000, maxRetries: 1 });
  const brief = {
    mission: input.missionTitle,
    description: input.missionDescription,
    location: input.locationName,
    permission_on_file: input.permissionNote,
    rubric: input.rubric,
  };

  try {
    const response = await client.beta.messages.parse({
      model: visionModel(),
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ReviewSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...input.photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 } })),
            { type: "text" as const, text: `Mission brief and rubric:\n${JSON.stringify(brief, null, 2)}` },
          ],
        },
      ],
    });

    await db()`
      insert into audit_events (actor_type, actor_id, action, resource_type, resource_id, metadata)
      values ('system', 'proof_engine', 'ai.review', 'model', ${response.model},
              ${db().json({ input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, photos: input.photos.length, stop_reason: response.stop_reason })})`;

    const out = response.parsed_output;
    if (response.stop_reason === "refusal" || !out) return humanReview(input, `model returned ${response.stop_reason}`);

    // One finding per rubric item, in rubric order; anything the model skipped counts as unclear.
    const findings = input.rubric.map((r) => {
      const f = out.findings.find((x) => x.requirement_id === r.id);
      return { requirement_id: r.id, requirement: r.requirement, met: f?.met ?? ("unclear" as const), note: f?.note ?? "Not assessed." };
    });
    return {
      result: deriveResult(findings, out.privacy_concern),
      findings,
      privacyConcern: out.privacy_concern,
      summary: out.summary,
      operatorMessage: out.operator_message,
      model: response.model,
    };
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionError) return humanReview(input, "AI unreachable");
    if (err instanceof Anthropic.APIError) return humanReview(input, `AI error ${err.status ?? ""}`.trim());
    throw err;
  }
}
