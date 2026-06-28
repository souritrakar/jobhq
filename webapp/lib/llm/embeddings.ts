/**
 * Dense text embeddings for semantic matching (today: the extension autofill field matcher).
 *
 * This is the single, swappable seam for embeddings. It calls OpenRouter's hosted embeddings API
 * (OpenAI-compatible: same `{ model, input }` request and `{ data: [{ index, embedding }] }`
 * response shape) — there's no model to host and no cold start, just one batched HTTPS request. It
 * reuses the same `OPENROUTER_API_KEY` the cover letter / AI draft features already use, so there's
 * no separate OpenAI account to manage. To move to a self-hosted FastEmbed service (or any other
 * provider) later, change ONLY this file; callers keep using `embed(texts)` unchanged.
 *
 * Server-side only — reads `OPENROUTER_API_KEY` and must never be bundled into the extension/client.
 */

import { env } from "@/lib/env"

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
// OpenRouter namespaces provider models — OpenAI's small embedder is `openai/text-embedding-3-small`
// (1536-dim, same vectors as the native OpenAI endpoint). Override via EMBEDDINGS_MODEL.
const DEFAULT_MODEL = "openai/text-embedding-3-small"

type EmbeddingsResponse = {
  data?: Array<{ index: number; embedding: number[] }>
}

/**
 * Embed a batch of short texts into dense vectors, returned in the SAME order as `texts`. One HTTP
 * round-trip for the whole batch. Returns `[]` for empty input without making a request.
 *
 * Throws on a missing key, a non-2xx response, or a malformed/short payload — callers surface a clean
 * error to the user rather than autofilling on bad vectors.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set — embeddings are unavailable.")
  }

  const model = env.EMBEDDINGS_MODEL || DEFAULT_MODEL

  const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Embeddings request failed (${res.status}): ${detail.slice(0, 300)}`)
  }

  const json = (await res.json()) as EmbeddingsResponse
  const data = json.data
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("Embeddings response was malformed or incomplete.")
  }

  // The response tags each item with its input `index`; sort by it so the vectors line up with
  // `texts` regardless of the order the API returns them in.
  return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
}
