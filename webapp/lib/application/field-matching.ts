import type { ApplicationFieldType } from "@/lib/llm/application-extraction"
import { decodeMultiValue, encodeMultiValue, isMultiValue } from "@/lib/application/answer-codec"

/**
 * Semantic matching between a job's SAVED application questions and the input fields harvested from a
 * live application page, for the extension's one-click Autofill.
 *
 * Direction is question → field: we iterate the saved questions and find each one's field on the page,
 * so a page/application that changed since the answers were saved degrades gracefully (a question with
 * no field is reported, not silently mis-filled).
 *
 * Matching today is PURE EMBEDDINGS (cosine over dense vectors). A deterministic `directMatch` pass is
 * implemented below but left disabled at the call site — the intended future pipeline is "direct first,
 * embeddings for the leftovers." Everything here is pure (the embed fn is injected) so it unit-tests
 * without a network call.
 */

export type QuestionDescriptor = {
  questionId: string
  label: string
  helpText?: string
}

export type FieldDescriptor = {
  fieldId: string
  label: string
}

export type FieldMatch = {
  questionId: string
  fieldId: string
  /** Cosine similarity of the winning pair (1 for a deterministic direct match). */
  score: number
}

export type MatchResult = {
  matched: FieldMatch[]
  /** Saved questions that found no field on the page — surfaced to the user in the result modal. */
  unmatchedQuestionIds: string[]
}

export type DomOption = { value: string; label: string }

/** Injected embedder — the real one (lib/llm/embeddings) in the route, a stub in tests. */
type EmbedFn = (texts: string[]) => Promise<number[][]>

// Minimum cosine for a pair to count as a match. THE key tunable: too low fills wrong fields, too high
// misses real ones. Calibrate against text-embedding-3-small during testing (~0.4–0.5 is a sane start;
// related short labels score ~0.5–0.8, unrelated ~0.1–0.3). Undo + highlight make a looser floor safe.
// Exported so the tiered details extractor (lib/extraction) reuses the SAME short-label floor.
export const MIN_SCORE = 0.45

// Cap on the text we embed per item — labels are short; this just bounds a runaway help-text blob.
const MAX_TEXT_LEN = 160

/**
 * Match saved questions to page fields one-to-one. Scores every (question, field) pair by cosine, then
 * assigns greedily best-first so each side is used at most once and only pairs ≥ MIN_SCORE survive.
 * Returns the matched pairs plus the ids of questions left without a field.
 */
export async function matchQuestionsToFields(
  questions: QuestionDescriptor[],
  fields: FieldDescriptor[],
  embed: EmbedFn,
): Promise<MatchResult> {
  if (questions.length === 0 || fields.length === 0) {
    return { matched: [], unmatchedQuestionIds: questions.map((q) => q.questionId) }
  }

  // --- Deterministic direct match (implemented, DISABLED for now) ----------------------------------
  // Intended pipeline: take exact normalized-label matches first, then embed only the leftovers. Kept
  // here, commented out, so we can switch it on later without restructuring. Today: pure embeddings.
  //
  //   const direct = directMatch(questions, fields)
  //   const matchedQ = new Set(direct.map((m) => m.questionId))
  //   const matchedF = new Set(direct.map((m) => m.fieldId))
  //   const restQ = questions.filter((q) => !matchedQ.has(q.questionId))
  //   const restF = fields.filter((f) => !matchedF.has(f.fieldId))
  //   ...embed restQ + restF, then merge `direct` with the embedding matches below...

  const qTexts = questions.map(questionText)
  const fTexts = fields.map((f) => cleanText(f.label))
  const vectors = await embed([...qTexts, ...fTexts])
  const qVecs = vectors.slice(0, questions.length)
  const fVecs = vectors.slice(questions.length)

  const pairs: Array<{ qi: number; fi: number; score: number }> = []
  for (let qi = 0; qi < questions.length; qi++) {
    for (let fi = 0; fi < fields.length; fi++) {
      pairs.push({ qi, fi, score: cosine(qVecs[qi], fVecs[fi]) })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const usedQ = new Set<number>()
  const usedF = new Set<number>()
  const matched: FieldMatch[] = []
  for (const { qi, fi, score } of pairs) {
    if (score < MIN_SCORE) break // sorted desc — nothing below the floor remains
    if (usedQ.has(qi) || usedF.has(fi)) continue
    usedQ.add(qi)
    usedF.add(fi)
    matched.push({ questionId: questions[qi].questionId, fieldId: fields[fi].fieldId, score })
  }

  const unmatchedQuestionIds = questions
    .filter((_, qi) => !usedQ.has(qi))
    .map((q) => q.questionId)

  return { matched, unmatchedQuestionIds }
}

/**
 * Deterministic exact-label matcher (normalized). IMPLEMENTED but not yet wired in — see the disabled
 * block in `matchQuestionsToFields`. One-to-one: the first unused field with an identical normalized
 * label wins.
 */
export function directMatch(
  questions: QuestionDescriptor[],
  fields: FieldDescriptor[],
): FieldMatch[] {
  const out: FieldMatch[] = []
  const usedF = new Set<number>()
  for (const q of questions) {
    const nq = normalizeLabel(q.label)
    if (!nq) continue
    const fi = fields.findIndex((f, i) => !usedF.has(i) && normalizeLabel(f.label) === nq)
    if (fi >= 0) {
      usedF.add(fi)
      out.push({ questionId: q.questionId, fieldId: fields[fi].fieldId, score: 1 })
    }
  }
  return out
}

/**
 * Map a saved choice answer to the page field's ACTUAL option value(s) to apply. Deterministic
 * normalized match (the saved answer is itself one of the question's options, so this is near-perfect
 * and far cheaper than embedding); an embedding fallback is noted but disabled. Returns the option
 * `value`s the extension should select (one for single choice, many for multi).
 */
export function resolveChoice(
  answerValue: string,
  question: { type: ApplicationFieldType; options?: string[] },
  domOptions: DomOption[],
): string[] {
  const wanted = isMultiValue(question)
    ? decodeMultiValue(answerValue)
    : answerValue
      ? [answerValue]
      : []

  const resolved: string[] = []
  for (const want of wanted) {
    const hit = matchOption(want, domOptions)
    // Embedding fallback (DISABLED): if `hit` is null, embed `want` against the option labels and take
    // the best above a floor. Off for now — normalized matching covers the realistic cases.
    if (hit) resolved.push(hit.value)
  }
  return resolved
}

/** Find the page option that best corresponds to a saved answer: exact normalized, then containment. */
function matchOption(answer: string, domOptions: DomOption[]): DomOption | null {
  const norm = normalizeLabel(answer)
  if (!norm) return null
  const exact = domOptions.find(
    (o) => normalizeLabel(o.label) === norm || normalizeLabel(o.value) === norm,
  )
  if (exact) return exact
  // Containment handles minor wording drift ("Yes" vs "Yes, I am authorized to work").
  return (
    domOptions.find((o) => {
      const ol = normalizeLabel(o.label)
      return ol && (ol.includes(norm) || norm.includes(ol))
    }) ?? null
  )
}

/**
 * Temporary stand-in value for a question with NO saved answer, by type (never `file`). Encoded the
 * same way real answers are, so downstream code treats it uniformly. These are placeholders the user
 * reviews (flagged + highlighted distinctly); they go away once settings-profile defaults exist.
 */
export function defaultValueForType(question: { type: ApplicationFieldType; options?: string[] }): string {
  const { type, options } = question
  switch (type) {
    case "short_text":
    case "long_text":
      return "N/A"
    case "number":
      return "0"
    case "url":
      return "https://example.com"
    case "email":
      return "name@example.com"
    case "tel":
      return "0000000000"
    case "date":
      return new Date().toISOString().slice(0, 10) // today, YYYY-MM-DD
    case "select":
    case "radio":
      return options?.[0] ?? ""
    case "checkbox":
      return options?.length ? encodeMultiValue([options[0]]) : "true" // consent → checked
    case "multi_select":
      return options?.length ? encodeMultiValue([options[0]]) : ""
    case "file":
      return ""
    default:
      return ""
  }
}

/** Cosine similarity of two equal-length vectors; 0 if either is a zero vector. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Aggressive normalization for exact comparison: lowercase, drop required/optional + punctuation. */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(required|optional)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

/** The text we embed for a question: its label, enriched with help text for extra context. */
function questionText(q: QuestionDescriptor): string {
  return cleanText(q.helpText ? `${q.label} — ${q.helpText}` : q.label)
}

/** Collapse whitespace and cap length — keep natural words (embeddings read them better than slugs). */
function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LEN)
}
