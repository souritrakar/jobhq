import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"

/**
 * Non-streaming chat completion via OpenRouter (OpenAI-compatible).
 *
 * The sibling of lib/llm/openrouter-stream.ts. The cover letter streams token-by-token (live
 * typing UX); the per-question AI draft does NOT — it's a short answer the user reviews/edits, so
 * we wait for the whole completion and return it as plain text. Not streaming buys two safety
 * properties the draft wants:
 *   - No "generating forever" failure mode: the request either resolves with the full answer or
 *     rejects (HTTP error / timeout). There is no open stream to stall.
 *   - A hard ceiling on spend: `max_tokens` caps output and an AbortController bounds wall-clock,
 *     so a misbehaving upstream can never run up an unbounded bill.
 *
 * It keeps the streaming client's two wins: a model fallback CHAIN (OpenRouter routes to the first
 * healthy slug) and prompt caching via a `cache_control` breakpoint on any message we mark
 * `cache: true`, so a static prefix (instructions, and a per-application job+resume block) is
 * reused across calls instead of re-billed. The key never leaves the server.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
// Hard wall-clock budget for the whole completion. A draft answer is small (≤ a few hundred
// tokens), so a healthy call returns in a few seconds; past this the upstream is wedged and we
// abort rather than hold the serverless function (and the user's spinner) open.
const REQUEST_TIMEOUT_MS = 45_000

export type LlmMessage = {
  role: "system" | "user"
  content: string
  /** Mark this message's content as a prompt-cache breakpoint (static prefix reused across calls). */
  cache?: boolean
}

export type ChatUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
}

export type ChatResult = {
  content: string
  usage: ChatUsage
  model: string
}

export type OpenRouterChatOptions = {
  /** Model fallback chain, primary first. OpenRouter tries them in order. */
  models: string[]
  temperature?: number
  maxTokens?: number
  /** ASCII-only attribution title (OpenRouter header is Latin1 — no em dashes here). */
  title?: string
}

/**
 * Convert our messages to OpenRouter's wire format. A `cache: true` message is sent as a
 * structured content part carrying a `cache_control` breakpoint (so supporting providers reuse it);
 * everything else stays a plain string. Marking the stable prefix lets multiple questions in one
 * application reuse the same cached job+resume block — only the question text is re-billed.
 */
function toWireMessages(messages: LlmMessage[]) {
  return messages.map((m) =>
    m.cache
      ? {
          role: m.role,
          content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }],
        }
      : { role: m.role, content: m.content },
  )
}

export async function openRouterChat(
  messages: LlmMessage[],
  opts: OpenRouterChatOptions,
): Promise<ChatResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new ApiError("INTERNAL", "AI drafting is not configured (OPENROUTER_API_KEY missing).")
  }

  const models = opts.models.filter((m, i, a) => m && a.indexOf(m) === i)
  if (models.length === 0) {
    throw new ApiError("INTERNAL", "AI drafting is misconfigured (no model set).")
  }

  const payload = JSON.stringify({
    model: models[0],
    models, // OpenRouter falls back through these in order if the primary is unavailable.
    messages: toWireMessages(messages),
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 600,
    // No chain-of-thought: a draft answer is prose, and reasoning would spend the cap (and cost)
    // on hidden tokens. No-op for non-reasoning models.
    reasoning: { enabled: false },
    stream: false,
  })

  const res = await post(payload, opts.title)

  if (res.status === 429) {
    await res.text().catch(() => "")
    throw new ApiError(
      "RATE_LIMITED",
      "The AI service is busy right now (rate limit reached). Please wait a few seconds and try again.",
    )
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new ApiError("INTERNAL", `OpenRouter returned HTTP ${res.status}`, detail.slice(0, 500))
  }

  const body = await res.json().catch(() => null)
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== "string" || content.trim() === "") {
    throw new ApiError("INTERNAL", "The AI service returned an empty answer. Please try again.")
  }

  const usage = body?.usage ?? {}
  return {
    content,
    model: typeof body?.model === "string" ? body.model : models[0],
    usage: {
      inputTokens: Number(usage.prompt_tokens ?? 0),
      outputTokens: Number(usage.completion_tokens ?? 0),
      totalTokens: Number(usage.total_tokens ?? 0),
      cachedTokens: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
    },
  }
}

// One POST with a hard timeout. A network failure or timeout throws an ApiError; HTTP-level
// failures come back as a Response for the caller to interpret.
async function post(payload: string, title?: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        // Header values must be Latin1 (ByteString) — keep ASCII-only; an em dash here throws.
        ...(title ? { "X-Title": title } : {}),
      },
      body: payload,
      signal: controller.signal,
    })
  } catch (err) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "The AI service took too long to respond. Please try again."
        : `AI draft request failed: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}
