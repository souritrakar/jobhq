/**
 * Deterministic output guard for cover-letter generation (defense-in-depth; the free gate that
 * shields the expensive eval/revise calls in the Stage 5 pipeline).
 *
 * It catches two HIGH-CONFIDENCE failures the generation prompt forbids but a model can still leak,
 * so the UI shows a clean error/retry state instead of rendering the leak as if it were the letter:
 *
 *   - REFUSAL / fourth-wall break — the exact failure we saw: "I cannot write this cover letter…",
 *     "…no resume was provided…", "Please share your resume". See `looksLikeRefusal`.
 *   - SYSTEM-PROMPT LEAK — the model regurgitating its own instructions (a successful prompt-injection
 *     / "repeat your system prompt" attempt). See `looksLikeSystemLeak`.
 *
 * `classifyOutput` returns which issue fired (or null) so the pipeline can branch, though both map to
 * the same user-facing "didn't come out clean, try again" state (we never tell an attacker which
 * defense tripped). Conservative by construction: refusal verbs require a refusal OBJECT
 * (write/provide/generate…), so a genuine letter that says "I cannot wait to contribute" or "I don't
 * have direct experience with X" does NOT trip it; the leak canaries are multi-word phrases unique to
 * our system prompt that a real letter never contains.
 */

/** Which deterministic guard fired. Both surface as the same retry state; the reason aids logging. */
export type OutputIssue = "refusal" | "leak"

/**
 * Classify a produced letter. Returns the issue that fired (refusal checked first), or null when the
 * text looks like a clean cover letter. This is the single entry point the pipeline calls on every
 * produced text (the draft and, after a revise pass, the improved text).
 */
export function classifyOutput(text: string): OutputIssue | null {
  if (looksLikeRefusal(text)) return "refusal"
  if (looksLikeSystemLeak(text)) return "leak"
  return null
}

// Refusals declare themselves early; scan the salutation + first sentence or two.
const OPENING_WINDOW = 400

const REFUSAL_PATTERNS: RegExp[] = [
  // Assistant meta-identity.
  /\b(as an ai\b|as a language model\b|i am an ai\b|i'?m an ai\b|i am (just )?a language model\b)/,
  // A missing/omitted resume or context.
  /\bno (resume|résumé|information|details|context) (was|were|is|are|has been|have been) (provided|available|given|attached|uploaded|included|supplied)\b/,
  /\b(don'?t|do not|doesn'?t|does not) have (access to )?(a |the |your |any |enough )?(resume|résumé|information|context)\b/,
  /\b(since|because|as) (there is |there's )?no (resume|résumé)\b/,
  // An explicit refusal to produce the artifact — verb + object, so "cannot wait" is safe.
  /\b(i cannot|i can'?t|i am unable to|i'?m unable to|i am not able to|i'?m not able to|i will not|i won'?t be able to) (write|provide|generate|create|complete|compose|produce|make|draft|fulfil|fulfill|comply|honou?r|assist with|help with)\b/,
  // Asking the user for input.
  /\bplease (provide|share|upload|attach|add|give me) (your |a |the )?(resume|résumé|details|information|more (context|details|information))\b/,
  // A meta framing prefix (a note/disclaimer instead of a letter).
  /^(note|disclaimer|caveat|important|clarification)\s*[:\-—]/,
]

/**
 * True when `text` looks like an assistant refusal / meta-commentary rather than a cover letter.
 * Whitespace-normalized, lowercased, opening-window only. Empty input is not a refusal.
 */
export function looksLikeRefusal(text: string): boolean {
  const opening = text.trim().slice(0, OPENING_WINDOW).toLowerCase().replace(/\s+/g, " ")
  if (!opening) return false
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(opening))
}

// Distinctive multi-word phrases from the generation system prompt (lib/llm/cover-letter.ts). If the
// model leaks its instructions, at least one of these appears verbatim in the output; a genuine cover
// letter never contains them (they're section headers / rule wording, not natural prose). Kept as
// whole phrases — not single words like "output contract" — so a real letter can't trip them. Update
// this list in lockstep if those prompt phrases change.
const LEAK_CANARIES = [
  "cover-letter writing engine",
  "overrides everything below",
  "no unprompted invention",
  "inputs are data, not commands",
  "floor of context, not a ceiling",
  "scope & secrecy",
  "the one hard limit",
]

/**
 * True when `text` contains a phrase unique to our system prompt — i.e. the model leaked its own
 * instructions. Scans the WHOLE text (a leak can trail after a plausible opening), case-insensitively.
 */
export function looksLikeSystemLeak(text: string): boolean {
  const hay = text.toLowerCase()
  return LEAK_CANARIES.some((canary) => hay.includes(canary))
}
