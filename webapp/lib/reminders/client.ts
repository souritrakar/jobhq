import type { Reminder } from "@/lib/reminders/types"

/**
 * Browser-side helpers for creating and mutating reminders. They speak the API's
 * `{ data } | { error }` envelope (see docs/BACKEND.md) and throw a plain Error with the
 * server's message on failure, so callers can surface it inline. Mirrors lib/jobs/client.ts.
 */

type Envelope<T> = { data?: T; error?: { code: string; message: string } }

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.data) {
    throw new Error(body?.error?.message ?? "Something went wrong. Try again.")
  }
  return body.data
}

/** Create a reminder linked to a job. Returns the created reminder. */
export function createReminder(
  jobId: string,
  fields: { title: string; dueAt?: string; hasTime?: boolean },
): Promise<Reminder> {
  return request(`/api/jobs/${jobId}/reminders`, {
    method: "POST",
    body: JSON.stringify(fields),
  })
}

/** Create a standalone reminder (not tied to a posting). Returns the created reminder. */
export function createStandaloneReminder(fields: {
  title: string
  dueAt?: string
  hasTime?: boolean
}): Promise<Reminder> {
  return request("/api/reminders", { method: "POST", body: JSON.stringify(fields) })
}

/** Toggle a reminder's done state. Returns the updated reminder. */
export function toggleReminder(id: string, done: boolean): Promise<Reminder> {
  return request(`/api/reminders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ done }),
  })
}

/** Delete a reminder. Resolves once the row is removed. */
export function deleteReminder(id: string): Promise<{ id: string; deleted: true }> {
  return request(`/api/reminders/${id}`, { method: "DELETE" })
}
