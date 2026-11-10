"use server";

import { cookies } from "next/headers";
import { PERSONA_COOKIE, isPersonaKey } from "@/lib/demo/personas";

export async function switchPersona(formData: FormData) {
  const key = formData.get("persona");
  if (!isPersonaKey(key)) return;
  (await cookies()).set(PERSONA_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}
