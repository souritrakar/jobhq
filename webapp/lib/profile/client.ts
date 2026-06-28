import type { ProfileSettings } from "@/components/dashboard/settings/profile-settings"

/**
 * Browser-side helper for saving the autofill profile. Speaks the API's `{ data } | { error }`
 * envelope (see docs/BACKEND.md) and throws a plain Error with the server's message on failure,
 * so the Settings form can surface it inline. Mirrors lib/reminders/client.ts.
 */

type Envelope<T> = { data?: T; error?: { code: string; message: string } }

/** Create or replace the current user's profile. Returns the saved (normalized) profile. */
export async function saveProfile(profile: ProfileSettings): Promise<ProfileSettings> {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  })
  const body = (await res.json().catch(() => null)) as Envelope<ProfileSettings> | null
  if (!res.ok || !body?.data) {
    throw new Error(body?.error?.message ?? "Something went wrong. Try again.")
  }
  return body.data
}
