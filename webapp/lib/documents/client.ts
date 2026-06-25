import type { ClientDocument } from "@/lib/documents/types"

/**
 * Browser-side helpers for the Documents page. They speak the API's `{ data } | { error }`
 * envelope and throw a plain Error with the server's message on failure, so callers can show
 * it in an inline/error state.
 *
 * Auth note: in dev the API falls back to DEV_USER_ID when no `x-user-id` header is sent
 * (lib/auth/current-user.ts), so these unauthenticated fetches resolve to the dev user.
 */

type Envelope<T> = { data?: T; error?: { code: string; message: string } }

/** Upload one file (with an optional title). Returns the created document. */
export async function uploadDocument(
  file: File,
  title?: string,
): Promise<ClientDocument> {
  const form = new FormData()
  form.append("file", file)
  if (title) form.append("title", title)

  const res = await fetch("/api/documents", { method: "POST", body: form })
  const json = (await res.json().catch(() => null)) as Envelope<ClientDocument> | null
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "Upload failed. Please try again.")
  }
  return json.data
}

/** Delete a document by id. */
export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${id}`, { method: "DELETE" })
  const json = (await res.json().catch(() => null)) as
    | Envelope<{ id: string; deleted: true }>
    | null
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "Couldn't delete that document.")
  }
}
