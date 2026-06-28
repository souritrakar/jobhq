"use server"

import { redirect } from "next/navigation"

import { auth } from "@/lib/auth/server"

/**
 * Sign the current user out and send them to the sign-in screen. A server action so the session
 * cookie is cleared server-side (reliable, no client race) and the redirect happens in one round
 * trip. Wired to the profile menu's "Sign out" button (see docs/AUTH.md).
 */
export async function signOutAction() {
  await auth.signOut()
  redirect("/auth/sign-in")
}
