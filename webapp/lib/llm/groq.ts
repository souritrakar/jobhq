import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import type { ChatMessage } from "@/lib/llm/extraction"

/**
 * Minimal server-side Groq chat-completions client.
 *
 * Groq exposes an OpenAI-compatible API. We force temperature 0 + JSON mode for
 * stable structured output and read the `usage` block so the caller can log token
 * spend. Failures throw — the calling service decides how to record/surface them.
 *
 * The key (GROQ_API_KEY) is read from the server env and never leaves the server.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const TIMEOUT_MS = 30_000
// 429 retry policy. We make up to MAX_429_ATTEMPTS total tries. Between them we wait the
// server's Retry-After when present (up to MAX_RETRY_WAIT_MS — beyond that we fail fast
// rather than block the request), or RETRY_BACKOFF_MS × attempt when no header is given.
const MAX_429_ATTEMPTS = 4
const RETRY_BACKOFF_MS = 1_500
const MAX_RETRY_WAIT_MS = 12_000

export type GroqUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type GroqResult = {
  content: string
  usage: GroqUsage
  model: string
}

export async function groqChat(
  messages: ChatMessage[],
  opts: { maxTokens?: number; model?: string; json?: boolean } = {},
): Promise<GroqResult> {
  if (!env.GROQ_API_KEY) {
    throw new ApiError(
      "INTERNAL",
      "Extraction is not configured (GROQ_API_KEY missing).",
    )
  }

  // JSON mode (default) forces a parseable object — right for the structured-field call.
  // The description-cleaning call sets json:false so it returns raw text; wrapping a long
  // description in JSON only inflates output tokens (escaped newlines/quotes) for no gain.
  const useJson = opts.json ?? true
  const payload = JSON.stringify({
    model: opts.model ?? env.GROQ_MODEL,
    messages,
    temperature: 0,
    max_tokens: opts.maxTokens ?? 400,
    ...(useJson ? { response_format: { type: "json_object" } } : {}),
  })

  // Groq's free tier has tight per-minute token limits, so a transient 429 is common on big
  // pages — and Groq often returns it WITHOUT a Retry-After header. So we retry on every 429
  // (not only when a header is present): honor Retry-After when given and short, otherwise
  // back off a fixed amount and try again. Most 429s clear within a couple of seconds, so the
  // user never sees an error. We only surface RATE_LIMITED after exhausting the attempts, or
  // immediately when the server explicitly asks for a long wait (a daily/larger-window cap).
  let res = await groqFetch(payload)
  for (let attempt = 1; res.status === 429 && attempt < MAX_429_ATTEMPTS; attempt++) {
    const suggested = retryAfterMs(res)
    if (suggested != null && suggested > MAX_RETRY_WAIT_MS) break // long wait → fail fast
    const waitMs = suggested != null ? suggested : attempt * RETRY_BACKOFF_MS
    await res.text().catch(() => "") // drain body before reusing the connection
    await sleep(waitMs)
    res = await groqFetch(payload)
  }

  if (res.status === 429) {
    const detail = await res.text().catch(() => "")
    throw new ApiError(
      "RATE_LIMITED",
      "The AI service is busy right now (rate limit reached). Please wait a few seconds and try again.",
      detail.slice(0, 500),
    )
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new ApiError(
      "INTERNAL",
      `Groq returned HTTP ${res.status}`,
      detail.slice(0, 500),
    )
  }

  const body = await res.json().catch(() => null)
  const content: string = body?.choices?.[0]?.message?.content ?? ""
  const usage: GroqUsage = {
    inputTokens: Number(body?.usage?.prompt_tokens ?? 0),
    outputTokens: Number(body?.usage?.completion_tokens ?? 0),
    totalTokens: Number(body?.usage?.total_tokens ?? 0),
  }
  return { content, usage, model: body?.model ?? opts.model ?? env.GROQ_MODEL }
}

// One POST to Groq with a per-attempt timeout. Network/timeout failures throw an ApiError;
// HTTP-level failures (incl. 429) come back as a Response for the caller to interpret.
async function groqFetch(payload: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: payload,
      signal: controller.signal,
    })
  } catch (err) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "Extraction timed out."
        : `Extraction request failed: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

// Parse a 429's Retry-After header → milliseconds. Supports both the delay-seconds form
// ("2", "1.5") and an HTTP-date. Returns null when absent/unparseable.
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after")
  if (!raw) return null
  const secs = Number(raw)
  if (Number.isFinite(secs)) return Math.max(0, Math.round(secs * 1000))
  const when = Date.parse(raw)
  return Number.isNaN(when) ? null : Math.max(0, when - Date.now())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
