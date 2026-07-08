import { env } from "@/lib/env"

/**
 * Content-safety moderation for the cover-letter guardrails — used on BOTH the input instructions
 * (before generation) and the finished letter (after), so a harmful/abusive request never spends a
 * generation and a harmful letter is never handed to the user.
 *
 * A purpose-built content-safety classifier reached over the SAME OpenRouter chat API the rest of the
 * feature uses (reusing OPENROUTER_API_KEY, no separate account). The default model
 * (`nvidia/nemotron-3.5-content-safety:free`) has a BROAD taxonomy — profanity, harassment,
 * hate/identity hate, sexual, violence, self-harm — so it catches abusive/profane instructions
 * ("fuck you bitch" → Profanity, Harassment) and lone slurs, which a harm-only guard like Llama Guard
 * does not. `parseVerdict` also understands Llama Guard's "safe|unsafe\n<S-codes>" format, so
 * MODERATION_MODEL can be swapped (Llama Guard, gpt-oss-safeguard, …) without code changes.
 *
 * Fail-open by design: if the key is missing or the classifier errors/times out, we ALLOW rather than
 * block. Moderation here is defense-in-depth on top of the generation model's own safety training and
 * grounded, low-risk inputs — silently blocking every letter when the classifier is down would be
 * worse UX. Callers can see `checked` to tell a clean pass from a skipped check.
 *
 * Server-side only — reads OPENROUTER_API_KEY; never bundle into the client/extension.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
// A classifier answers in a handful of tokens; keep it snappy and never let it stall generation.
const TIMEOUT_MS = 10_000

export type ModerationResult = {
  /** True when the classifier judged the text unsafe. */
  flagged: boolean
  /** The violated category labels (classifier's own names, or Llama Guard S-codes) when flagged. */
  categories: string[]
  /** False when the check was skipped (no key) or errored (fail-open) — i.e. not actually verified. */
  checked: boolean
}

const ALLOWED: ModerationResult = { flagged: false, categories: [], checked: false }
const PASSED: ModerationResult = { flagged: false, categories: [], checked: true }

/**
 * Classify a piece of text as safe/unsafe. Empty/whitespace input is trivially allowed without a
 * request. Never throws — network/parse failures resolve to a fail-open ALLOWED result.
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  if (!text.trim()) return PASSED

  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) return ALLOWED // fail open — nothing to call with

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "jobhq - Moderation",
      },
      body: JSON.stringify({
        model: env.MODERATION_MODEL,
        messages: [{ role: "user", content: text }],
        temperature: 0,
        max_tokens: 64,
        // Nemotron content-safety is a reasoning model; left on, its chain-of-thought eats the token
        // budget and the actual "User Safety: …" verdict gets truncated. It classifies fine without it.
        // No-op for non-reasoning classifiers (Llama Guard).
        reasoning: { enabled: false },
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      await res.text().catch(() => "")
      console.warn(`[moderation] classifier returned HTTP ${res.status}; failing open`)
      return ALLOWED
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const verdict = json.choices?.[0]?.message?.content ?? ""
    return parseVerdict(verdict)
  } catch (err) {
    console.warn(`[moderation] classifier call failed; failing open: ${String(err)}`)
    return ALLOWED
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parse a content-safety classifier's completion. Handles both supported formats:
 *   - Nemotron:    "User Safety: unsafe\nSafety Categories: Profanity, Harassment"
 *   - Llama Guard: "unsafe\nS1,S10"   (or "safe")
 * The verdict token is matched with WORD BOUNDARIES (so the label word "Safety" does not false-match
 * "safe"); "unsafe" is checked first. Categories come from a "Categories: …" line and/or any S-codes.
 * An unrecognizable verdict (e.g. a truncated "User Safety:") fails open (treated as a skip), since
 * guessing "unsafe" from garbage would block legitimate letters.
 */
export function parseVerdict(raw: string): ModerationResult {
  const text = raw.trim()
  if (!text) return ALLOWED

  if (/\bunsafe\b/i.test(text)) {
    return { flagged: true, categories: extractCategories(text), checked: true }
  }
  if (/\bsafe\b/i.test(text)) return PASSED

  return ALLOWED // unrecognized output — skip rather than false-positive
}

// Pull human-readable category names from a "Categories: a, b" line, plus any Llama Guard S-codes.
function extractCategories(text: string): string[] {
  const names = text
    .match(/categor(?:y|ies)\s*:\s*(.+)/i)?.[1]
    ?.split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean)
  const sCodes = (text.match(/\bS\d{1,2}\b/g) ?? []).map((c) => c.toUpperCase())
  return [...new Set([...(names ?? []), ...sCodes])]
}
