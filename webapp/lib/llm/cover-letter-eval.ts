/**
 * Cover-letter QUALITY JUDGE (Stage 5 eval) — pure prompt building + verdict parsing, no I/O.
 *
 * A single cheap LLM call grades a finished draft against a rubric and returns a structured verdict.
 * It judges SUBJECTIVE QUALITY only — grounding, tailoring, specificity, instruction compliance, and
 * artifact integrity. It is NOT the safety/refusal check (those are deterministic + Llama Guard, run
 * separately in the pipeline). The verdict decides whether a dedicated reviser is invoked.
 *
 * Two deliberate design choices (see docs/COVER_LETTER.md and the Stage 5 spec):
 *
 *   - SENTINEL, NOT JSON SCHEMA. A json_schema response_format would force OpenRouter's
 *     `require_parameters:true`, narrowing routing and fighting the model fallback chain. So the
 *     judge emits a fixed 6-line plain-text block we parse deterministically — resilient across every
 *     fallback model.
 *   - PASS IS COMPUTED IN CODE. We never trust the model's own VERDICT line for the decision; `pass`
 *     is derived from the per-dimension scores against fixed floors (the VERDICT line is only a
 *     sanity cross-check). An unparseable verdict FAILS OPEN — a flaky judge must never block a safe,
 *     already-generated letter.
 *
 * The judge model must be a DIFFERENT family than the generator (self-enhancement bias): generator is
 * Claude, judge defaults to DeepSeek V4 Flash (see env EVAL_MODEL).
 */

import type { LlmMessage } from "@/lib/llm/openrouter"
import { type CoverLetterJob, sanitizeAndCap } from "@/lib/llm/cover-letter"

/** Deterministic grading — the judge should score the same letter the same way every run. */
export const EVAL_TEMPERATURE = 0
/** The verdict is 6 short lines; a small cap keeps it cheap and forbids the model rambling. */
export const EVAL_MAX_TOKENS = 200

/** The rubric dimensions, in the fixed order the judge emits them. */
export const EVAL_DIMENSIONS = [
  "GROUNDING",
  "TAILORING",
  "SPECIFICITY",
  "INSTRUCTIONS",
  "INTEGRITY",
] as const
export type EvalDimension = (typeof EVAL_DIMENSIONS)[number]

/**
 * Per-dimension pass floor (1–5). A draft PASSES only when every SCORED dimension meets its floor.
 * Integrity is strictest (a leak/AI-tell is disqualifying); grounding + instructions are high (the
 * two behaviours users notice most); tailoring + specificity are moderate.
 */
export const EVAL_FLOORS: Record<EvalDimension, number> = {
  GROUNDING: 4,
  TAILORING: 3,
  SPECIFICITY: 3,
  INSTRUCTIONS: 4,
  INTEGRITY: 5,
}

// Cap the judge's view of the letter — a draft is ~1 page, but bound it defensively like every other
// embedded input so a pathological draft can't blow up the judge's context/cost.
const LETTER_MAX_CHARS = 8_000
const RESUME_MAX_CHARS = 20_000
const JOB_DESCRIPTION_MAX_CHARS = 12_000
const INSTRUCTIONS_MAX_CHARS = 2_000

export type EvalVerdict = {
  /** Raw 1–5 score per dimension; null = the judge marked it NA (only valid for INSTRUCTIONS). */
  scores: Record<EvalDimension, number | null>
  /** PASS ⇔ every scored dimension ≥ its floor. Computed here, not trusted from the model. */
  pass: boolean
  /** The judge's non-"ok" gap notes for below-floor dimensions — concrete directives for the reviser. */
  gaps: string[]
  /** False when the output couldn't be parsed → the pipeline fails open and ships the draft. */
  parsed: boolean
}

export type EvalInputs = {
  job: CoverLetterJob
  resumeText: string
  instructions?: string | null
  /** The candidate draft being graded. */
  letter: string
}

/** Primary model first, then configured fallbacks, in order, deduped. Pure (slugs passed in). */
export function evalModelChain(model: string, fallbacks: string): string[] {
  const extra = fallbacks
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return [model, ...extra].filter((m, i, a) => Boolean(m) && a.indexOf(m) === i)
}

const SYSTEM_PROMPT = [
  "You are a strict quality grader for cover letters. You are given a job posting, the candidate's",
  "resume, the user's instructions, and a DRAFT cover letter. Grade ONLY the draft's subjective",
  "writing quality on the rubric below. You are NOT a safety or policy checker, and you never rewrite",
  "the letter — you only score it.",
  "",
  "RUBRIC — score each dimension 1 (poor) to 5 (excellent):",
  "1. GROUNDING — does the letter draw on the candidate's REAL resume skills and experience, coherently",
  "   and specifically? A resume is always attached, so a strong letter is clearly built from it. Score",
  "   LOW only for AI-INVENTED facts: employers, titles, projects, tools, dates, or metrics that appear",
  "   in NEITHER the resume NOR the user's instructions. Do NOT penalize content the user explicitly",
  "   asked to include that isn't in the resume — that is authorized, not a fabrication.",
  "2. TAILORING — does it reflect the posting's key skills, keywords, and requirements, and address the",
  "   single most important requirement? A generic letter that ignores the posting scores low.",
  "3. SPECIFICITY — is it concrete and particular to THIS candidate and role, free of boilerplate and",
  "   AI clichés ('passionate about', 'proven track record', 'hit the ground running')? A letter that",
  "   could be sent to any company scores low.",
  "4. INSTRUCTIONS — does it honor the user's tone/length/emphasis/structure instructions in full? If",
  "   the user instructions are '(none)', score this NA.",
  "5. INTEGRITY — is it a clean artifact: no meta/assistant commentary, no leaked instructions, no",
  "   error or thinking traces, no bracketed [placeholders], correct salutation → body → sign-off shape?",
  "",
  "OUTPUT FORMAT — output EXACTLY these six lines and NOTHING else (no preamble, no markdown, no",
  "code fences). Each score line is: NAME: <1-5 or NA> | <gap in 12 words or fewer, or the word ok>.",
  "The gap note names what to improve when the score is below excellent; write 'ok' when the dimension",
  "is strong. The final line is your overall call.",
  "",
  "GROUNDING: <score> | <gap or ok>",
  "TAILORING: <score> | <gap or ok>",
  "SPECIFICITY: <score> | <gap or ok>",
  "INSTRUCTIONS: <score or NA> | <gap or ok>",
  "INTEGRITY: <score> | <gap or ok>",
  "VERDICT: PASS or REVISE",
].join("\n")

function jobBlock(job: CoverLetterJob): string {
  const description = job.description?.trim()
    ? sanitizeAndCap(job.description, JOB_DESCRIPTION_MAX_CHARS)
    : "(none captured)"
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    "Description:",
    description,
  ].join("\n")
}

/** Build the judge messages. System prompt is cached (static across every eval); the rest varies. */
export function buildEvalMessages(inputs: EvalInputs): LlmMessage[] {
  const { job, resumeText, instructions, letter } = inputs

  const instructionsValue = instructions?.trim()
    ? sanitizeAndCap(instructions, INSTRUCTIONS_MAX_CHARS)
    : "(none)"

  const user = [
    "Grade this draft cover letter against the rubric. Output only the six lines.",
    "",
    "JOB POSTING",
    jobBlock(job),
    "",
    "RESUME (the candidate's real background):",
    '"""',
    sanitizeAndCap(resumeText, RESUME_MAX_CHARS),
    '"""',
    "",
    "USER INSTRUCTIONS (score INSTRUCTIONS as NA if this is '(none)'):",
    '"""',
    instructionsValue,
    '"""',
    "",
    "DRAFT COVER LETTER being graded:",
    '"""',
    sanitizeAndCap(letter, LETTER_MAX_CHARS),
    '"""',
  ].join("\n")

  return [
    { role: "system", content: SYSTEM_PROMPT, cache: true },
    { role: "user", content: user },
  ]
}

// Match one rubric line: "NAME: <score> | <note>". Tolerant of case, spacing, and either "|" or a
// dash as the score/note separator, so a slightly-off model still parses.
function dimensionRegex(dim: EvalDimension): RegExp {
  return new RegExp(`${dim}\\s*[:\\-]\\s*(\\d+|NA)\\s*(?:[|\\-–—]\\s*(.*))?`, "i")
}

/**
 * Parse the judge's 6-line verdict into a structured result. Computes `pass` from the per-dimension
 * floors (NOT from the model's VERDICT line). If any always-scored dimension (all but INSTRUCTIONS,
 * which may be NA) is missing or non-numeric, the output is treated as unparseable → `parsed:false`,
 * which the pipeline reads as fail-open (ship the draft).
 */
export function parseEvalVerdict(raw: string): EvalVerdict {
  const scores = {} as Record<EvalDimension, number | null>
  const gaps: string[] = []
  let parseable = true

  for (const dim of EVAL_DIMENSIONS) {
    const match = raw.match(dimensionRegex(dim))
    const scoreToken = match?.[1]?.toUpperCase()
    const note = match?.[2]?.trim() ?? ""

    if (!scoreToken) {
      // INSTRUCTIONS is allowed to be absent (auto-pass, treated as NA); any other missing dimension
      // means we couldn't trust the grade → fail open.
      scores[dim] = null
      if (dim !== "INSTRUCTIONS") parseable = false
      continue
    }

    if (scoreToken === "NA") {
      scores[dim] = null
      continue
    }

    const value = Number(scoreToken)
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      scores[dim] = null
      if (dim !== "INSTRUCTIONS") parseable = false
      continue
    }

    scores[dim] = value
    // Collect an actionable gap only for a below-floor dimension with a real (non-"ok") note.
    if (value < EVAL_FLOORS[dim] && note && note.toLowerCase() !== "ok") {
      gaps.push(`${titleCase(dim)}: ${note}`)
    }
  }

  if (!parseable) {
    return { scores, pass: false, gaps: [], parsed: false }
  }

  // PASS ⇔ every dimension that carries a numeric score meets its floor.
  const pass = EVAL_DIMENSIONS.every((dim) => {
    const score = scores[dim]
    return score === null || score >= EVAL_FLOORS[dim]
  })

  return { scores, pass, gaps, parsed: true }
}

/** Render the eval's gaps as a single directive string for the reviser (the "WHAT to change"). */
export function renderGapsForRevise(gaps: string[]): string {
  return gaps.join("\n")
}

function titleCase(dim: EvalDimension): string {
  return dim.charAt(0) + dim.slice(1).toLowerCase()
}
