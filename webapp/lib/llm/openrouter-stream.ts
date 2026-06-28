import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import type { ChatMessage } from "@/lib/llm/extraction"

/**
 * Streaming cover-letter generation via OpenRouter (OpenAI-compatible).
 *
 * OpenRouter fronts many model providers behind one OpenAI-style API, which buys us two things the
 * cover letter wants:
 *   - Model fallback: we send a CHAIN (Claude Haiku 4.5 → GLM 4.7 Flash → Gemini 3.1 Flash Lite) and
 *     OpenRouter routes to the first one that's available/healthy. One slug being down never
 *     fails the request. Configure via COVER_LETTER_MODEL + COVER_LETTER_FALLBACK_MODELS.
 *   - Prompt caching: the long, static system prompt is marked as a cache breakpoint
 *     (`cache_control`), so providers that support caching (Anthropic, Gemini, …) reuse it across
 *     calls instead of re-billing those input tokens every time. Providers without caching just
 *     ignore the hint.
 *
 * Like the rest of the route, every clean failure (missing key, rate limit, bad request) is thrown
 * as an ApiError BEFORE the stream opens, so it still surfaces as the JSON `{ error }` envelope.
 * The key never leaves the server.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
// Time budget to ESTABLISH the stream (first byte). Generation runs longer — once the stream is
// open we don't abort on this timer; the route's maxDuration bounds total time.
const CONNECT_TIMEOUT_MS = 30_000
// Once the stream is open, the longest we tolerate the upstream going SILENT before treating it as
// a stall and closing. During healthy generation OpenRouter sends content (and ': OPENROUTER
// PROCESSING' keep-alives while queued) sub-second apart, so a multi-second gap means the provider
// died mid-stream. Without this, a stall hangs the client forever and keeps the serverless function
// alive (and billed) until maxDuration — the "generating forever" bug.
const STALL_TIMEOUT_MS = 25_000

export type StreamChatOptions = {
  temperature?: number
  maxTokens?: number
}

/** Primary model first, then configured fallbacks, in order, deduped. */
function modelChain(): string[] {
  const fallbacks = env.COVER_LETTER_FALLBACK_MODELS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return [env.COVER_LETTER_MODEL, ...fallbacks].filter((m, i, a) => a.indexOf(m) === i)
}

/**
 * Convert provider-agnostic messages to OpenRouter's wire format. The system message is sent as a
 * structured content part carrying a `cache_control` breakpoint so it can be cached; user content
 * (which changes every call) stays a plain string.
 */
function toWireMessages(messages: ChatMessage[]) {
  return messages.map((m) =>
    m.role === "system"
      ? {
          role: m.role,
          content: [
            { type: "text", text: m.content, cache_control: { type: "ephemeral" } },
          ],
        }
      : { role: m.role, content: m.content },
  )
}

export async function streamCoverLetter(
  messages: ChatMessage[],
  opts: StreamChatOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  if (!env.OPENROUTER_API_KEY) {
    throw new ApiError(
      "INTERNAL",
      "Cover-letter generation is not configured (OPENROUTER_API_KEY missing).",
    )
  }

  const chain = modelChain()
  const payload = JSON.stringify({
    model: chain[0],
    models: chain, // OpenRouter tries these in order if the primary is unavailable.
    messages: toWireMessages(messages),
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 700,
    // GLM 4.7 is a reasoning model; for prose we don't want chain-of-thought. Disabling it keeps
    // the whole token budget (and cost) on the letter and avoids truncation mid-thought. The flag
    // is a no-op for non-reasoning fallbacks.
    reasoning: { enabled: false },
    stream: true,
  })

  const res = await connect(payload)

  if (res.status === 429) {
    await res.text().catch(() => "")
    throw new ApiError(
      "RATE_LIMITED",
      "The AI service is busy right now (rate limit reached). Please wait a few seconds and try again.",
    )
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "")
    throw new ApiError("INTERNAL", `OpenRouter returned HTTP ${res.status}`, detail.slice(0, 500))
  }

  return toTextStream(res.body)
}

// One POST that opens the SSE stream, with a connect-only timeout. Network/timeout failures throw
// an ApiError; HTTP-level failures come back as a Response for the caller to interpret.
async function connect(payload: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS)
  try {
    return await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        // Optional OpenRouter attribution headers (shown in their dashboard/rankings).
        // Header values must be Latin1 (ByteString) — keep this ASCII-only; an em-dash here throws.
        "X-Title": "JobTracker - Cover Letter",
      },
      body: payload,
      signal: controller.signal,
    })
  } catch (err) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "The AI service took too long to respond. Please try again."
        : `Cover-letter request failed: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

// Transform OpenRouter's OpenAI-style SSE byte stream into a stream of plain letter text. Each SSE
// event is a `data: {json}\n\n` block; we pull `choices[0].delta.content` out of each and drop the
// rest (the role-only first chunk, keep-alive `:` comments, and the final `data: [DONE]`). A small
// buffer handles events split across network reads.
function toTextStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value, stalled } = await readWithStallTimeout(reader)
        // Upstream went silent past the stall budget: cancel it and end the stream cleanly so the
        // client finalizes whatever streamed in (rather than hanging) and the function can exit.
        if (stalled) {
          reader.cancel().catch(() => {})
          controller.close()
          return
        }
        if (done) {
          controller.close()
          return
        }
        buffer += decoder.decode(value, { stream: true })

        let sep: number
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const { text, done: finished } = extractDelta(event)
          if (text) controller.enqueue(encoder.encode(text))
          // Close as soon as the model signals completion ([DONE] / finish_reason) instead of
          // waiting for the upstream socket to close — OpenRouter often holds it open after the
          // last token, which would otherwise hang the client's reader and keep this serverless
          // invocation alive (and billed) until maxDuration. Cancel the upstream to free it.
          if (finished) {
            controller.close()
            reader.cancel().catch(() => {})
            return
          }
        }
      } catch (err) {
        controller.error(err)
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })
}

type StallableRead = { done: boolean; value?: Uint8Array; stalled?: boolean }

// One upstream read, but resolves `{ stalled: true }` if no bytes arrive within STALL_TIMEOUT_MS.
// The pending read() is left to settle on its own (cancel() in the caller resolves it); its result
// is ignored. The rejection handler keeps an aborted read from surfacing as an unhandled rejection.
function readWithStallTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<StallableRead> {
  return new Promise<StallableRead>((resolve) => {
    const timer = setTimeout(() => resolve({ done: false, value: undefined, stalled: true }), STALL_TIMEOUT_MS)
    reader.read().then(
      (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      () => {
        clearTimeout(timer)
        resolve({ done: true, value: undefined })
      },
    )
  })
}

// Pull the assistant text out of one SSE event block (which may contain multiple `data:` lines),
// and report whether the block signals end-of-stream (so the caller can close promptly).
function extractDelta(event: string): { text: string; done: boolean } {
  let out = ""
  let done = false
  for (const line of event.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) continue // skips `:` keep-alive comments too
    const data = trimmed.slice(5).trim()
    if (data === "") continue
    if (data === "[DONE]") {
      done = true
      continue
    }
    try {
      const json = JSON.parse(data)
      const piece = json?.choices?.[0]?.delta?.content
      if (typeof piece === "string") out += piece
      // Providers that don't emit a trailing `[DONE]` mark the final chunk with a finish_reason.
      if (json?.choices?.[0]?.finish_reason) done = true
    } catch {
      // A data line split across reads — shouldn't happen given blank-line framing; skip it.
    }
  }
  return { text: out, done }
}
