import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"

/**
 * Minimal server-side Firecrawl scrape client — the one external call behind the
 * in-app "save a job from a URL" import.
 *
 * Firecrawl's `/v2/scrape` JSON format runs its OWN LLM over the cleaned page and
 * returns exactly the schema we ask for, so the whole job extraction (details +
 * application questions) happens inside this single request — we never touch our
 * Groq pipeline on this path. The `branding` format rides along in the same call to
 * supply the company logo. `onlyMainContent` strips nav/boilerplate before extraction.
 *
 * The key (FIRECRAWL_API_KEY) is read from the server env and never leaves the server.
 * Failures throw an ApiError; the calling service decides how to surface them.
 */

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape"
// Firecrawl renders the page AND runs an LLM for the JSON extraction, so a scrape is slow and
// its latency is variable — JS-heavy ATS pages (Greenhouse et al.) were measured at 50–75s.
// We give the API a generous 100s budget so real pages finish rather than timing out, and our
// fetch a bit more so Firecrawl's own (clean) timeout error wins over a bare fetch abort. The
// import route sets maxDuration to cover this in production.
const API_TIMEOUT_MS = 100_000
const FETCH_TIMEOUT_MS = 115_000

/** The `images` sub-object of a Firecrawl branding profile (camelCase as the API returns). */
export type FirecrawlBrandingImages = {
  logo?: string | null
  favicon?: string | null
  ogImage?: string | null
}

/** The slice of Firecrawl's branding profile we use (logo sources). Other keys are ignored. */
export type FirecrawlBranding = {
  logo?: string | null
  images?: FirecrawlBrandingImages | null
}

export type FirecrawlScrapeResult<T> = {
  /** The structured extraction, matching the schema we passed (or null if absent). */
  json: T | null
  /** Branding profile (logo sources), present when `branding` was requested. */
  branding: FirecrawlBranding | null
  /** Page metadata (sourceURL, statusCode, title…). */
  metadata: Record<string, unknown> | null
}

type ScrapeOptions = {
  /** JSON Schema describing the structured output we want extracted. */
  schema: Record<string, unknown>
  /** Natural-language extraction instructions / guardrails for Firecrawl's LLM. */
  prompt: string
  /** Also request the `branding` format (logo) in the same call. */
  branding?: boolean
}

/**
 * Scrape `url` and extract structured JSON (+ optional branding) in a single call.
 * Returns the parsed `data.json` / `data.branding` / `data.metadata` from the response.
 */
export async function scrapeStructured<T>(
  url: string,
  { schema, prompt, branding = false }: ScrapeOptions,
): Promise<FirecrawlScrapeResult<T>> {
  if (!env.FIRECRAWL_API_KEY) {
    throw new ApiError(
      "INTERNAL",
      "Saving from a link isn't configured (FIRECRAWL_API_KEY missing).",
    )
  }

  const formats: unknown[] = [{ type: "json", prompt, schema }]
  if (branding) formats.push({ type: "branding" })

  const payload = JSON.stringify({
    url,
    onlyMainContent: true,
    timeout: API_TIMEOUT_MS,
    formats,
  })

  const res = await firecrawlFetch(payload)

  // Rate limit (429) or out of credits (402) — both mean "try again / not us", surfaced as
  // a friendly, retryable message rather than a generic 500.
  if (res.status === 429 || res.status === 402) {
    const detail = await res.text().catch(() => "")
    throw new ApiError(
      "RATE_LIMITED",
      "The import service is busy right now. Please wait a few seconds and try again.",
      detail.slice(0, 500),
    )
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new ApiError(
      "INTERNAL",
      `Firecrawl returned HTTP ${res.status}`,
      detail.slice(0, 500),
    )
  }

  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: Record<string, unknown>; error?: string; code?: string }
    | null

  // A scrape that couldn't load the page (404, blocked, login-walled, or too slow to render)
  // comes back as success:false (or with no data). That's about the URL the user gave us, so
  // it's a 400 the UI can show with a clean message — Firecrawl's verbose error text goes to
  // `details` for logs, not to the user.
  if (!body || body.success === false || !body.data) {
    const message =
      body?.code === "SCRAPE_TIMEOUT"
        ? "That page took too long to load. Please try again — some sites are slow or block automated reading."
        : "We couldn't read a job posting at that link. Check that it points to a single job posting."
    throw new ApiError("BAD_REQUEST", message, body?.error)
  }

  const data = body.data
  return {
    json: (data.json ?? null) as T | null,
    branding: (data.branding ?? null) as FirecrawlBranding | null,
    metadata: (data.metadata ?? null) as Record<string, unknown> | null,
  }
}

// One POST to Firecrawl with a per-request timeout. Network/timeout failures throw an
// ApiError; HTTP-level failures (incl. 429/402) come back as a Response for the caller.
async function firecrawlFetch(payload: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      },
      body: payload,
      signal: controller.signal,
    })
  } catch (err) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "Reading the posting took too long. Please try again."
        : `The import request failed: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}
