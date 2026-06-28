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

/**
 * Bulk-move pipeline status for many jobs in one request (the Kanban board's batched save).
 * Speaks the same `{ data } | { error }` envelope as the per-job helpers above.
 *
 * `keepalive` lets the request outlive the page during a tab-close / navigation flush — a normal
 * fetch is killed on teardown, but a keepalive one is allowed to finish (the response isn't read
 * in that case, since the page is already going away).
 */
export function patchJobStatuses(
  changes: { id: string; status: JobStatus }[],
  opts?: { keepalive?: boolean },
): Promise<void> {
  return fetch("/api/jobs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
    keepalive: opts?.keepalive,
  }).then(async (res) => {
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as Envelope<unknown> | null
      throw new Error(body?.error?.message ?? "Couldn't save your changes. Try again.")
    }
  })
}
