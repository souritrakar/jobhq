import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"

/**
 * context.dev structured-extraction client — an ALTERNATIVE to the Firecrawl scrape client
 * (firecrawl.ts), under evaluation for the "save a job from a URL" import. It is intentionally
 * shaped to be a drop-in replacement: `extractStructured` takes the SAME `{ schema, prompt }`
 * and returns the SAME `{ json, branding, metadata }` result as `scrapeStructured`, so the import
 * service could switch providers by changing one import. The schema/prompt are unchanged (the
 * same JOB_IMPORT_SCHEMA / JOB_IMPORT_PROMPT) — context.dev runs its own LLM over the page.
 *
 * Differences from Firecrawl worth knowing (and surfaced in the spike report):
 *   - `instructions` is capped at 2000 chars by the API, so a long hardened prompt is TRUNCATED.
 *     The schema's per-field descriptions still carry most of the guidance, and `factCheck` adds
 *     an explicit-only guard, but the full prose prompt does not fit.
 *   - There is NO branding/logo format — `branding` is always null here.
 *   - It can CRAWL (`maxPages`/`maxDepth`): set maxPages > 1 to let it follow links (e.g. an
 *     "Apply" link) and pull job details + the application form from separate pages in one call.
 *
 * The key (CONTEXT_DEV_API_KEY) is read from server env and never leaves the server.
 */

const CONTEXT_DEV_URL = "https://api.context.dev/v1/web/extract"
// Hard API cap on the natural-language instructions field.
const MAX_INSTRUCTIONS = 2000
// Browser render wait after page load. REQUIRED for JS-heavy SPAs (Ashby/Greenhouse): without it
// context.dev reads no markdown and returns WEBSITE_ACCESS_ERROR. 10s matched the live behaviour.
const WAIT_FOR_MS = 10_000
// Crawl soft time budget (API max 110_000) and request abort threshold (API max 300_000). Sized
// to roughly match the Firecrawl client's generous budgets for slow JS-heavy ATS pages.
const STOP_AFTER_MS = 105_000
const TIMEOUT_MS = 115_000
const FETCH_TIMEOUT_MS = 120_000

/** Same result shape as FirecrawlScrapeResult, so this is a drop-in for scrapeStructured. */
export type ContextDevResult<T> = {
  /** The structured extraction, matching the schema we passed (or null if absent). */
  json: T | null
  /** Always null — context.dev has no branding/logo format. Present for shape-compatibility. */
  branding: null
  /** Crawl/extraction metadata (numUrls, numSucceeded, …). */
  metadata: Record<string, unknown> | null
  /** The URLs context.dev actually read to produce the result (1+ when crawling). */
  urlsAnalyzed: string[]
}

type ExtractOptions = {
  /** JSON Schema describing the structured output we want extracted. */
  schema: Record<string, unknown>
  /** Natural-language extraction instructions (TRUNCATED to 2000 chars — API limit). */
  prompt: string
  /** Only return values explicitly stated on the page (anti-hallucination). Default true. */
  factCheck?: boolean
  /** Pages to analyze from the start URL (1–50). Default 1 — single page, like a Firecrawl scrape. */
  maxPages?: number
}

/**
 * Extract structured JSON from `url` via context.dev. Returns the parsed `data` (matching the
 * schema) plus crawl metadata. Whether the instructions were truncated is reported separately by
 * the caller if needed (see `instructionsTruncated`).
 */
export async function extractStructured<T>(
  url: string,
  { schema, prompt, factCheck = true, maxPages = 1 }: ExtractOptions,
): Promise<ContextDevResult<T>> {
  if (!env.CONTEXT_DEV_API_KEY) {
    throw new ApiError(
      "INTERNAL",
      "context.dev isn't configured (CONTEXT_DEV_API_KEY missing).",
    )
  }

  const payload = JSON.stringify({
    url,
    schema,
    instructions: prompt.slice(0, MAX_INSTRUCTIONS),
    factCheck,
    maxPages,
    waitForMs: WAIT_FOR_MS,
    stopAfterMs: STOP_AFTER_MS,
    timeoutMS: TIMEOUT_MS,
  })

  const res = await contextDevFetch(payload)

  // Parse the JSON body once. Success: { status:"ok", data, metadata, urls_analyzed }. Error:
  // { message, error_code, key_metadata } with the HTTP status carrying the class of failure.
  const body = (await res.json().catch(() => null)) as
    | {
        status?: string
        data?: unknown
        metadata?: Record<string, unknown>
        urls_analyzed?: string[]
        message?: string
        error_code?: string
      }
    | null

  if (res.ok && body?.status === "ok" && body.data != null) {
    return {
      json: body.data as T,
      branding: null,
      metadata: body.metadata ?? null,
      urlsAnalyzed: body.urls_analyzed ?? [],
    }
  }

  // Map the failure. The page-access / timeout / validation classes are about the URL the user
  // gave us → a clean 400; rate limit → retryable; auth → server misconfig (our key).
  const code = body?.error_code
  const detail = body?.message ?? code

  if (res.status === 429 || code === "RATE_LIMITED") {
    throw new ApiError(
      "RATE_LIMITED",
      "The import service is busy right now. Please wait a few seconds and try again.",
      detail,
    )
  }
  if (res.status === 401 || res.status === 403 || code === "UNAUTHORIZED") {
    throw new ApiError("INTERNAL", "context.dev rejected the API key.", detail)
  }
  if (
    code === "WEBSITE_ACCESS_ERROR" ||
    code === "REQUEST_TIMEOUT" ||
    code === "INPUT_VALIDATION_ERROR" ||
    res.status === 400
  ) {
    const message =
      code === "REQUEST_TIMEOUT"
        ? "That page took too long to load. Please try again — some sites are slow or block automated reading."
        : "We couldn't read a job posting at that link. Check that it points to a single job posting."
    throw new ApiError("BAD_REQUEST", message, detail)
  }
  throw new ApiError("INTERNAL", `context.dev returned HTTP ${res.status}`, detail)
}

/** True if `prompt` is longer than context.dev's instructions cap (so it would be truncated). */
export function instructionsTruncated(prompt: string): boolean {
  return prompt.length > MAX_INSTRUCTIONS
}

// One POST to context.dev with a per-request timeout. Network/timeout failures throw an ApiError;
// HTTP-level failures come back as a Response for the caller to map.
async function contextDevFetch(payload: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(CONTEXT_DEV_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CONTEXT_DEV_API_KEY}`,
      },
      body: payload,
      signal: controller.signal,
    })
  } catch (err) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "Reading the posting took too long. Please try again."
        : `The context.dev request failed: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}
