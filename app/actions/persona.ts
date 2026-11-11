"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PERSONA_COOKIE, homeFor, isPersonaKey, personaByKey } from "@/lib/demo/personas";

async function setPersona(key: unknown): Promise<boolean> {
  if (!isPersonaKey(key)) return false;
  (await cookies()).set(PERSONA_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

/** Pseudo-login: pick a demo profile and land on that role's home. */
export async function selectProfile(formData: FormData) {
  const key = formData.get("persona");
  if (!(await setPersona(key))) return;
  redirect(homeFor(personaByKey(key as Parameters<typeof personaByKey>[0])));
}

/** Pseudo-logout: forget the profile and return to the landing page. */
export async function signOut() {
  (await cookies()).delete(PERSONA_COOKIE);
  redirect("/");
}
