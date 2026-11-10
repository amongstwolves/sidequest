import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { MISSION_CATEGORIES } from "@/lib/policy";

// Mission Genesis + Decomposition (spec §8.1, §8.3). Claude proposes a typed plan; validatePlan()
// and the policy gate decide. If the model is unavailable, a deterministic template keeps the demo working.

const CAPABILITIES = ["photo", "retail_display", "event", "assist"] as const;

const PlanSchema = z.object({
  summary: z.string().describe("One sentence describing the overall outcome."),
  missions: z.array(
    z.object({
      title: z.string().describe("Short imperative title, under 60 characters."),
      category: z.enum(MISSION_CATEGORIES),
      location_id: z.string().describe("Must be one of the provided location ids."),
      description: z.string().describe("What the operator does on site, 1-3 sentences."),
      reward_usd: z.number().int().describe("Whole US dollars."),
      required_capabilities: z.array(z.enum(CAPABILITIES)),
      rubric: z
        .array(z.object({ requirement: z.string().describe("One photo-checkable requirement.") }))
        .describe("3-4 requirements a reviewer can verify from photos."),
      safety_notes: z.string(),
    }),
  ),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type PlanDraft = z.infer<typeof PlanSchema>;

export type LocationForPlan = {
  id: string;
  name: string;
  neighborhood: string;
  address_label: string;
  permission_note: string;
};

export type PlanInput = {
  requestText: string;
  budgetMinor: number;
  deadline: Date;
  locations: LocationForPlan[];
};

export type GeneratedPlan = { plan: PlanDraft; model: string; usedFallback: boolean; fallbackReason?: string };

const SYSTEM_PROMPT = `You plan physical-world verification missions for SIDEQUEST, a marketplace where local human operators complete short, paid, permitted tasks and submit photo proof.

Turn the requester's objective into independent missions, one per location that needs a visit. Each mission must be completable by one person in under an hour, paid on its own, and verifiable from photos.

Rules:
- Use only the location ids provided. Never invent locations, addresses, permissions or operator availability.
- Respect each location's permission note: if it only permits exterior photos, the mission must not ask for interior photos.
- The total of reward_usd across missions must not exceed the budget. Typical rewards are $20-$40 per mission; leave some budget unspent rather than padding.
- Categories: RECON (photograph an authorized display), SCOUT (confirm something publicly visible), EVENT (photograph an approved event setup), ASSIST (light, non-hazardous help).
- Required capabilities: include "photo" for any mission with photo proof and "retail_display" for checking in-store displays.
- Rubric requirements must be concrete and checkable from photos (e.g. "Display shows the autumn price card").
- Never plan surveillance of people, collecting personal data, entering restricted areas, impersonation, regulated goods or hazardous work. If the request asks for any of these, return no missions and explain why in warnings.
- If the request names no locations, choose the provided locations that fit it and say so in assumptions.`;

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

function planningModel(): string {
  return process.env.AI_PLANNING_MODEL || "claude-opus-5-5";
}

/** Cost guardrail: count today's AI calls in the audit log. */
async function aiCallsToday(): Promise<number> {
  const [row] = await db()`
    select count(*)::int as n from audit_events
    where action like 'ai.%' and created_at >= date_trunc('day', now())`;
  return row.n;
}

export async function generatePlan(input: PlanInput): Promise<GeneratedPlan> {
  if (!isAiConfigured()) return templatePlan(input, "AI key not configured");
  const limit = Number(process.env.AI_DAILY_CALL_LIMIT || 200);
  if ((await aiCallsToday()) >= limit) return templatePlan(input, "Daily AI call limit reached");

  const client = new Anthropic({ apiKey: process.env.AI_API_KEY, timeout: 90_000, maxRetries: 1 });
  const model = planningModel();
  const userContent = JSON.stringify(
    {
      objective: input.requestText,
      budget_usd: input.budgetMinor / 100,
      deadline: input.deadline.toISOString(),
      locations: input.locations,
    },
    null,
    2,
  );

  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    await db()`
      insert into audit_events (actor_type, actor_id, action, resource_type, resource_id, metadata)
      values ('system', 'mission_genesis', 'ai.plan', 'model', ${response.model},
              ${db().json({ input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, stop_reason: response.stop_reason })})`;

    if (response.stop_reason === "refusal") return templatePlan(input, "The model declined this request");
    if (!response.parsed_output) return templatePlan(input, `Unparseable model output (${response.stop_reason})`);
    return { plan: response.parsed_output, model: response.model, usedFallback: false };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return templatePlan(input, "AI rate limited");
    if (err instanceof Anthropic.AuthenticationError) return templatePlan(input, "AI key rejected");
    if (err instanceof Anthropic.APIConnectionError) return templatePlan(input, "AI unreachable");
    if (err instanceof Anthropic.APIError) return templatePlan(input, `AI error ${err.status ?? ""}`.trim());
    throw err;
  }
}

/** Deterministic plan used when the model is unavailable: one RECON mission per named (or first two) locations. */
export function templatePlan(input: PlanInput, reason: string): GeneratedPlan {
  const text = input.requestText.toLowerCase();
  const named = input.locations.filter(
    (l) => text.includes(l.name.toLowerCase()) || text.includes(l.neighborhood.toLowerCase()),
  );
  const chosen = (named.length ? named : input.locations.slice(0, 2)).slice(0, 5);
  const each = Math.max(5, Math.min(40, Math.floor((input.budgetMinor * 0.9) / 100 / Math.max(1, chosen.length))));
  return {
    model: "template",
    usedFallback: true,
    fallbackReason: reason,
    plan: {
      summary: `Photo verification at ${chosen.map((l) => l.name).join(" and ")}.`,
      missions: chosen.map((l) => ({
        title: `Verify the display at ${l.name}`,
        category: "RECON" as const,
        location_id: l.id,
        description: `Visit ${l.name} (${l.address_label}) and photograph the campaign display as permitted: ${l.permission_note}`,
        reward_usd: each,
        required_capabilities: ["photo", "retail_display"],
        rubric: [
          { requirement: `Storefront of ${l.name} is visible to confirm the location` },
          { requirement: "Campaign display is set up and fully visible" },
          { requirement: "Price card or signage on the display is readable" },
        ],
        safety_notes: "Stay in permitted areas. Do not photograph customers or staff faces.",
      })),
      assumptions: named.length ? [] : ["No location was named, so the first two campaign locations were used."],
      warnings: [`Template plan used: ${reason}.`],
    },
  };
}

export type ValidatedMission = {
  title: string;
  category: string;
  location_id: string;
  description: string;
  reward_minor: number;
  required_capabilities: string[];
  rubric: { id: string; requirement: string }[];
  safety_notes: string;
};

/** Structural validation of a model plan against platform facts. Returns errors instead of trusting the model. */
export function validatePlan(plan: PlanDraft, input: PlanInput): { missions: ValidatedMission[]; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set(input.locations.map((l) => l.id));
  const missions = plan.missions.map((m, i): ValidatedMission => {
    const label = `Mission ${i + 1}`;
    if (!ids.has(m.location_id)) errors.push(`${label} uses an unknown location "${m.location_id}".`);
    if (!Number.isInteger(m.reward_usd) || m.reward_usd < 5) errors.push(`${label} reward must be at least $5.`);
    if (m.rubric.length < 2) errors.push(`${label} needs at least two proof requirements.`);
    if (!m.title.trim() || !m.description.trim()) errors.push(`${label} is missing a title or description.`);
    const caps = [...new Set(m.required_capabilities)];
    if ((m.category === "RECON" || m.category === "SCOUT") && !caps.includes("photo")) caps.push("photo");
    return {
      title: m.title.trim().slice(0, 80),
      category: m.category,
      location_id: m.location_id,
      description: m.description.trim(),
      reward_minor: Math.round(m.reward_usd * 100),
      required_capabilities: caps,
      rubric: m.rubric.slice(0, 6).map((r, j) => ({ id: `r${j + 1}`, requirement: r.requirement.trim() })),
      safety_notes: m.safety_notes.trim(),
    };
  });
  return { missions, errors };
}
