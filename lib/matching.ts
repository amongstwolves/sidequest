// Matching/Dispatch (spec §8.4). Hard filters first, then a weighted score over normalized features.
// Pure function over the seeded operators: rankings are computed, never prewired.
import { distanceMeters } from "./geo";

export type OperatorForMatch = {
  user_id: string;
  display_name: string;
  persona_key: string | null;
  availability: "available" | "busy" | "offline";
  status: string;
  lat: number;
  lng: number;
  radius_meters: number;
  capabilities: string[];
  reliability_score: number;
  active_assignments: number;
};

export type MissionForMatch = {
  lat: number;
  lng: number;
  required_capabilities: string[];
  deadline: Date;
};

export type MatchResult = {
  operator: OperatorForMatch;
  distanceMeters: number;
  eligible: boolean;
  exclusion?: string;
  score: number;
  breakdown: { proximity: number; availability: number; capability: number; reliability: number; deadlineFit: number };
};

const WEIGHTS = { proximity: 0.35, availability: 0.25, capability: 0.2, reliability: 0.1, deadlineFit: 0.1 };

export function rankOperators(mission: MissionForMatch, operators: OperatorForMatch[], now = new Date()): MatchResult[] {
  const hoursLeft = (mission.deadline.getTime() - now.getTime()) / 3_600_000;

  const results = operators.map((op): MatchResult => {
    const d = distanceMeters(op, mission);
    const missing = mission.required_capabilities.filter((c) => !op.capabilities.includes(c));
    let exclusion: string | undefined;
    if (op.status !== "active") exclusion = "Account suspended";
    else if (op.availability === "offline") exclusion = "Offline";
    else if (op.availability === "busy") exclusion = "Busy";
    else if (d > op.radius_meters) exclusion = `Outside service radius (${(op.radius_meters / 1609.344).toFixed(1)} mi)`;
    else if (missing.length) exclusion = `Missing skill: ${missing.join(", ")}`;
    else if (hoursLeft <= 0) exclusion = "Deadline passed";

    const proximity = Math.max(0, 1 - d / op.radius_meters);
    const availability = op.active_assignments === 0 ? 1 : op.active_assignments === 1 ? 0.5 : 0.2;
    const capability = mission.required_capabilities.length
      ? (mission.required_capabilities.length - missing.length) / mission.required_capabilities.length
      : 1;
    const reliability = op.reliability_score;
    // Rough travel estimate at ~20 km/h plus 30 min on site; 1 when there's ample slack.
    const hoursNeeded = d / 20_000 + 0.5;
    const deadlineFit = hoursLeft <= 0 ? 0 : Math.min(1, hoursLeft / (hoursNeeded * 4));
    const breakdown = { proximity, availability, capability, reliability, deadlineFit };
    const score =
      WEIGHTS.proximity * proximity +
      WEIGHTS.availability * availability +
      WEIGHTS.capability * capability +
      WEIGHTS.reliability * reliability +
      WEIGHTS.deadlineFit * deadlineFit;

    return { operator: op, distanceMeters: d, eligible: !exclusion, exclusion, score: exclusion ? 0 : score, breakdown };
  });

  return results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.distanceMeters - b.distanceMeters);
}
