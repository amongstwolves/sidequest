import "server-only";
import { cookies } from "next/headers";

// Demo personas behind the role switcher. User IDs match db/seed.sql.
// Judges can act as the requester and both operators without creating accounts.
export const PERSONAS = [
  {
    key: "requester",
    role: "Requester",
    name: "Demo Brand Co.",
    userId: "00000000-0000-4000-8000-000000000001",
    payoutEnv: null,
  },
  {
    key: "operator_a",
    role: "Operator A",
    name: "Riley Okonkwo",
    userId: "00000000-0000-4000-8000-0000000000a1",
    payoutEnv: "OPERATOR_A_EMAIL",
  },
  {
    key: "operator_b",
    role: "Operator B",
    name: "Marisol Tran",
    userId: "00000000-0000-4000-8000-0000000000b1",
    payoutEnv: "OPERATOR_B_EMAIL",
  },
] as const;

export type Persona = (typeof PERSONAS)[number];
export type PersonaKey = Persona["key"];

export const PERSONA_COOKIE = "sq_persona";

export function isPersonaKey(value: unknown): value is PersonaKey {
  return PERSONAS.some((p) => p.key === value);
}

export function personaByKey(key: PersonaKey): Persona {
  return PERSONAS.find((p) => p.key === key)!;
}

/** Current demo persona from the request cookie (defaults to the requester). */
export async function currentPersona(): Promise<Persona> {
  const value = (await cookies()).get(PERSONA_COOKIE)?.value;
  return personaByKey(isPersonaKey(value) ? value : "requester");
}

/** Sandbox PayPal account that receives payouts for an operator persona. */
export function payoutReceiverFor(persona: Persona): string | null {
  return persona.payoutEnv ? process.env[persona.payoutEnv] || null : null;
}
