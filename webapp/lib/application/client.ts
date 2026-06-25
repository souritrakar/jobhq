/**
 * Browser-side helpers for the job detail page's application form: saving a question's answer and
 * AI-drafting one. Both speak the API's `{ data } | { error }` envelope (see docs/BACKEND.md) and
 * throw a plain Error with the server's message on failure, so the field can show it inline.
 */

type Envelope<T> = { data?: T; error?: { code: string; message: string } }

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.data) {
    throw new Error(body?.error?.message ?? "Something went wrong. Try again.")
  }
  return body.data
}

/**
 * Save a batch of answers in one request (the form's manual "Save changes"). Each entry upserts a
 * question's answer; an empty `value` clears it. Returns the saved `{ questionId: value }` map.
 */
export async function saveAnswers(
  jobId: string,
  answers: ReadonlyArray<{ questionId: string; value: string }>,
): Promise<Record<string, string>> {
  const res = await fetch(`/api/jobs/${jobId}/application/answers`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  })
  return unwrap(res)
}

/**
 * AI-draft one question's answer. Accepts an AbortSignal so the caller can cancel on unmount or a
 * new request — together with the server's own timeout this guarantees the draft can never hang
 * the UI in a "generating forever" state.
 */
export async function draftAnswer(
  jobId: string,
  questionId: string,
  signal?: AbortSignal,
): Promise<{ value: string }> {
  const res = await fetch(`/api/jobs/${jobId}/application/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId }),
    signal,
  })
  return unwrap(res)
}
