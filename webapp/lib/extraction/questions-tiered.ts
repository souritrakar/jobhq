/**
 * Tiered (non-LLM) application-question extractor. Pure — embedder + prototype vectors injected, so it
 * unit-tests with a stub and no network. An alternative to lib/server/application-extractions.ts (the
 * Groq path), returning the EXACT same ApplicationQuestion[] shape so it's drop-in behind the /tiered
 * route.
 *
 *   Tier 1 — deterministic: the extension harvests every form control (reusing the autofill label
 *            heuristics) into typed descriptors; mapHarvestToQuestions() turns DOM kind + native input
 *            type + label cues into our 12-type vocab. This replaces the LLM's "read the form" step.
 *   Tier 2 — embeddings inclusion GATE: keep a field iff its label is semantically closer to the
 *            question prototypes than to the noise prototypes (search/login/newsletter/cookie). This
 *            replaces the LLM's "is this a real application question?" judgment, generalizing across
 *            phrasings without a keyword list. Structurally-strong fields (choice/file/long-text/
 *            required) only need to beat noise; weak free-text fields must clear an absolute floor too.
 *
 * The kept questions pass through normalizeApplicationQuestions() — the SAME sieve the LLM output uses
 * — so caps, type coercion, option cleanup, and sentinel filtering are byte-identical. An empty form
 * returns { questions: [] } (the "no application form" empty state) with no embed call.
 */

import { cosine } from "@/lib/application/field-matching"
import {
  normalizeApplicationQuestions,
  type ApplicationFieldType,
  type ApplicationQuestion,
} from "@/lib/llm/application-extraction"
import type { EmbedFn, PrototypeVectors } from "@/lib/extraction/prototype-embeddings"

const DEFAULT_KEEP_FLOOR = 0.3 // absolute floor for weak free-text fields
const DEFAULT_NOISE_MARGIN = 0.03 // how far a weak field must beat the noise space to be kept
const MAX_TEXT_LEN = 160

/** One harvested form control from the live page (the extension's questions-oriented harvest). */
export type HarvestedQuestionField = {
  id: string
  label: string
  kind: "text" | "textarea" | "select" | "radio" | "checkbox" | "contenteditable" | "combobox" | "file"
  /** Native <input type> for kind "text" (email/url/tel/date/number/…) — authoritative when present. */
  inputType?: string
  /** Choice labels for select/radio/checkbox-group/combobox. */
  options?: string[]
  required?: boolean
  placeholder?: string
  helpText?: string
}

export type QuestionsCoverage = {
  questions: ApplicationQuestion[]
  /** Harvested controls before the gate. */
  candidateCount: number
  /** Controls kept after the gate. */
  keptCount: number
  /** keptCount / candidateCount — telemetry. */
  confidence: number
}

export type QuestionsDeps = {
  embed: EmbedFn
  getPrototypes: () => Promise<PrototypeVectors>
  keepFloor?: number
  noiseMargin?: number
}

/* ------------------------------------------------------------------------------------------------ */
/* Tier 1: deterministic DOM kind/type → our question shape                                         */
/* ------------------------------------------------------------------------------------------------ */

/** Turn harvested controls into typed questions (no filtering yet). */
export function mapHarvestToQuestions(fields: HarvestedQuestionField[]): ApplicationQuestion[] {
  return fields.map(toQuestion)
}

function toQuestion(f: HarvestedQuestionField): ApplicationQuestion {
  const type = mapType(f)
  const q: ApplicationQuestion = { label: f.label, type }
  if (f.placeholder && f.placeholder.trim()) q.placeholder = f.placeholder.trim()
  if (f.helpText && f.helpText.trim()) q.helpText = f.helpText.trim()
  if (f.required) q.required = true
  if (TYPES_WITH_OPTIONS.has(type) && f.options?.length) q.options = f.options
  return q
}

const TYPES_WITH_OPTIONS = new Set<ApplicationFieldType>(["select", "radio", "multi_select", "checkbox"])

function mapType(f: HarvestedQuestionField): ApplicationFieldType {
  switch (f.kind) {
    case "file":
      return "file"
    case "textarea":
    case "contenteditable":
      return "long_text"
    case "select":
      return "select"
    case "radio":
      return "radio"
    case "combobox":
      // A typed/custom dropdown with options is a select; otherwise treat as text and infer.
      return f.options?.length ? "select" : inferTextType(f)
    case "checkbox":
      // A 2+ checkbox group is "select all that apply"; a lone checkbox is a consent toggle.
      return f.options && f.options.length >= 2 ? "multi_select" : "checkbox"
    case "text":
    default:
      return fromInputType(f.inputType) ?? inferTextType(f)
  }
}

/** Native <input type> → our type (authoritative). Returns null for plain text so cues can refine it. */
function fromInputType(inputType?: string): ApplicationFieldType | null {
  switch ((inputType ?? "").toLowerCase()) {
    case "number":
      return "number"
    case "email":
      return "email"
    case "url":
      return "url"
    case "tel":
      return "tel"
    case "date":
    case "datetime-local":
    case "month":
    case "week":
      return "date"
    default:
      return null
  }
}

/** Refine a plain-text field by label/placeholder keywords; conservative — defaults to short_text. */
function inferTextType(f: HarvestedQuestionField): ApplicationFieldType {
  const s = `${f.label} ${f.placeholder ?? ""}`.toLowerCase()
  if (/\be-?mail\b/.test(s)) return "email"
  if (/linkedin|github|portfolio|\bwebsite\b|\burl\b|https?:\/\//.test(s)) return "url"
  if (/\bphone\b|\bmobile\b|telephone|\bcell\b/.test(s)) return "tel"
  if (/date of birth|start date|available|\bdate\b/.test(s)) return "date"
  if (/years? of experience|how many years|number of years|\bgpa\b/.test(s)) return "number"
  return "short_text"
}

/* ------------------------------------------------------------------------------------------------ */
/* Tier 2: embeddings inclusion gate                                                                */
/* ------------------------------------------------------------------------------------------------ */

/** Harvest → typed questions → semantic gate → normalize. Empty input short-circuits (no embed call). */
export async function extractQuestionsTiered(
  fields: HarvestedQuestionField[],
  deps: QuestionsDeps,
): Promise<QuestionsCoverage> {
  if (fields.length === 0) {
    return { questions: [], candidateCount: 0, keptCount: 0, confidence: 0 }
  }
  const keepFloor = deps.keepFloor ?? DEFAULT_KEEP_FLOOR
  const noiseMargin = deps.noiseMargin ?? DEFAULT_NOISE_MARGIN

  const mapped = fields.map((field) => ({ field, question: toQuestion(field) }))
  const protos = await deps.getPrototypes()
  const labelVecs = await deps.embed(mapped.map((m) => cleanText(m.question.label)))

  const kept = mapped.filter((m, i) =>
    keepField(m.field, m.question, labelVecs[i], protos, keepFloor, noiseMargin),
  )

  const { questions } = normalizeApplicationQuestions({ questions: kept.map((m) => m.question) })
  return {
    questions,
    candidateCount: fields.length,
    keptCount: questions.length,
    confidence: questions.length / fields.length,
  }
}

/**
 * The gate. Structurally-strong fields (choice/file/long-text/required) are real questions unless they
 * look MORE like noise than a question. Weak free-text/consent fields — where site search, login, and
 * newsletter inputs live — must also clear an absolute floor and beat noise by a margin.
 */
function keepField(
  field: HarvestedQuestionField,
  question: ApplicationQuestion,
  vec: number[],
  protos: PrototypeVectors,
  keepFloor: number,
  noiseMargin: number,
): boolean {
  const qScore = maxCosine(vec, protos.question)
  const nScore = maxCosine(vec, protos.noise)
  if (isStructurallyStrong(field, question)) return qScore >= nScore
  return qScore >= keepFloor && qScore >= nScore + noiseMargin
}

function isStructurallyStrong(field: HarvestedQuestionField, question: ApplicationQuestion): boolean {
  if (field.required) return true
  if (question.type === "file" || question.type === "long_text") return true
  if (question.type === "select" || question.type === "radio" || question.type === "multi_select") {
    return true
  }
  return false
}

function maxCosine(vec: number[], protos: number[][]): number {
  let best = 0
  for (const p of protos) {
    const c = cosine(vec, p)
    if (c > best) best = c
  }
  return best
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LEN)
}
