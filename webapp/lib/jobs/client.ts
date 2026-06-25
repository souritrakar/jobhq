import type { JobStatus } from "@prisma/client"

/**
 * Browser-side helpers for mutating a job from the detail page. They speak the API's
 * `{ data } | { error }` envelope (see docs/BACKEND.md) and throw a plain Error with the
 * server's message on failure, so callers can surface it in a toast/inline state.
 *
 * Auth note: in dev the API falls back to DEV_USER_ID when no `x-user-id` header is sent
 * (lib/auth/current-user.ts), so these unauthenticated fetches resolve to the dev user.
 * When real auth lands, the session cookie travels automatically — nothing here changes.
 */

type Envelope<T> = { data?: T; error?: { code: string; message: string } }

async function send<T>(id: string, init: RequestInit): Promise<T> {
  const res = await fetch(`/api/jobs/${id}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.data) {
    throw new Error(body?.error?.message ?? "Something went wrong. Try again.")
  }
  return body.data
}

/** Patch tracking fields (status, notes, deadline, resume, …). Returns the updated job. */
export function patchJob(
  id: string,
  fields: {
    status?: JobStatus
    notes?: string | null
    resumeDocumentId?: string | null
    /** ISO string to set the interview date, or null to clear it (and its SYSTEM reminder). */
    interviewAt?: string | null
  },
) {
  return send(id, { method: "PATCH", body: JSON.stringify(fields) })
}

/** Delete a job. Resolves once the row is removed. */
export function deleteJobRequest(id: string) {
  return send<{ id: string; deleted: true }>(id, { method: "DELETE" })
}
