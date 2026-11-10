// Policy Guardian (spec §8.2, §9). Deterministic rules are authoritative: the AI plan never
// overrides them. Pure functions so they can be unit-tested and reused by the agent API.

export type PolicyDecision = "ALLOW" | "ALLOW_WITH_CONDITIONS" | "REQUIRES_HUMAN_REVIEW" | "REJECT";

export type PolicyResult = {
  decision: PolicyDecision;
  reasons: string[];
};

export const MISSION_CATEGORIES = ["RECON", "SCOUT", "EVENT", "ASSIST"] as const;
export type MissionCategory = (typeof MISSION_CATEGORIES)[number];

/** Activities SIDEQUEST never publishes, whoever asks. Matched on the request and on every generated mission. */
const PROHIBITED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(follow|track|tail|stalk|monitor)\w*\b.{0,40}\b(person|people|him|her|them|someone|employee|ex|spouse|customer)s?\b/i, reason: "Tracking or following people is prohibited." },
  { pattern: /\b(covert|secret(ly)?|hidden camera|undercover|spy|surveil)\w*/i, reason: "Covert observation or surveillance is prohibited." },
  { pattern: /\b(license plate|home address|where (he|she|they) live)/i, reason: "Collecting personal location data is prohibited." },
  { pattern: /\b(trespass|break in|sneak (in|into)|after hours|restricted area|behind the counter)\b/i, reason: "Entering places without permission is prohibited." },
  { pattern: /\b(weapon|firearm|gun|ammunition|drug|narcotic|vape|alcohol|prescription)s?\b/i, reason: "Prohibited or regulated goods are out of scope." },
  { pattern: /\b(impersonat\w*|pretend to be|pose as|posing as)\b/i, reason: "Impersonation is prohibited." },
  { pattern: /\b(climb|roof|ladder|electrical|hazard\w*|chemical)s?\b/i, reason: "Hazardous work is out of scope." },
];

export function screenText(text: string): PolicyResult {
  const reasons = PROHIBITED.filter((p) => p.pattern.test(text)).map((p) => p.reason);
  return reasons.length ? { decision: "REJECT", reasons } : { decision: "ALLOW", reasons: [] };
}

export type AgentPolicy = {
  daily_limit_minor: number;
  per_mission_limit_minor: number;
  allowed_categories: string[];
  allowed_region: string;
  requires_human_approval_above_minor: number;
  expires_at: Date | null;
};

export type PlanForPolicy = {
  requestText: string;
  budgetMinor: number;
  missions: { title: string; description: string; category: string; reward_minor: number }[];
};

/** Platform-wide caps for human requesters during the demo. */
export const HUMAN_LIMITS = { maxBudgetMinor: 50_000, perMissionMinor: 10_000, maxMissions: 5 };

/**
 * Evaluate a plan. Agents are additionally held to their spending policy (spec §9);
 * spentTodayMinor is what the agent has already committed today.
 */
export function evaluatePlan(
  plan: PlanForPolicy,
  agent?: { policy: AgentPolicy; spentTodayMinor: number; region: string },
): PolicyResult {
  const reasons: string[] = [];
  let decision = "ALLOW" as PolicyDecision;
  const reject = (r: string) => {
    reasons.push(r);
    decision = "REJECT";
  };

  for (const r of screenText(plan.requestText).reasons) reject(r);
  for (const m of plan.missions) {
    for (const r of screenText(`${m.title} ${m.description}`).reasons) reject(`Mission "${m.title}": ${r}`);
  }

  const total = plan.missions.reduce((s, m) => s + m.reward_minor, 0);
  if (plan.missions.length === 0) reject("The plan contains no missions.");
  if (plan.missions.length > HUMAN_LIMITS.maxMissions) reject(`At most ${HUMAN_LIMITS.maxMissions} missions per objective.`);
  if (total > plan.budgetMinor) reject(`Mission rewards ($${total / 100}) exceed the budget ($${plan.budgetMinor / 100}).`);

  if (agent) {
    const p = agent.policy;
    if (p.expires_at && p.expires_at.getTime() < Date.now()) reject("The agent's credentials have expired.");
    if (agent.region !== p.allowed_region) reject(`Region "${agent.region}" is outside the agent's allowed region.`);
    for (const m of plan.missions) {
      if (!p.allowed_categories.includes(m.category)) reject(`Category ${m.category} is not allowed for this agent.`);
      if (m.reward_minor > p.per_mission_limit_minor)
        reject(`Mission "${m.title}" ($${m.reward_minor / 100}) exceeds the per-mission limit ($${p.per_mission_limit_minor / 100}).`);
    }
    if (plan.budgetMinor > p.daily_limit_minor - agent.spentTodayMinor)
      reject(
        `Budget $${plan.budgetMinor / 100} exceeds the agent's remaining daily limit ($${(p.daily_limit_minor - agent.spentTodayMinor) / 100} of $${p.daily_limit_minor / 100}).`,
      );
    if (decision !== "REJECT" && total > p.requires_human_approval_above_minor) {
      decision = "REQUIRES_HUMAN_REVIEW";
      reasons.push(`Total above $${p.requires_human_approval_above_minor / 100} needs the principal's approval.`);
    }
  } else {
    if (plan.budgetMinor > HUMAN_LIMITS.maxBudgetMinor) reject(`Demo budgets are capped at $${HUMAN_LIMITS.maxBudgetMinor / 100}.`);
    for (const m of plan.missions) {
      if (!(MISSION_CATEGORIES as readonly string[]).includes(m.category)) reject(`Category ${m.category} is not offered yet.`);
      if (m.reward_minor > HUMAN_LIMITS.perMissionMinor) reject(`Mission "${m.title}" exceeds the per-mission cap.`);
    }
  }

  if (decision === "ALLOW") {
    decision = "ALLOW_WITH_CONDITIONS";
    reasons.push("Photos must show only the authorized display and storefront; no faces, no interiors beyond the permitted area.");
  }
  return { decision, reasons };
}
