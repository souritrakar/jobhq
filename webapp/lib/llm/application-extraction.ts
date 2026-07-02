/**
 * Application-question extraction prompt + output shaping — pure, no I/O.
 *
 * Sibling of extraction.ts. Where that module reads a posting's *details* (title, salary,
 * description…), this one reads the *application form* a candidate must fill in and returns
 * the list of questions as structured, typed fields. The extension captures the rendered
 * form (simplified HTML) and we make ONE model call that returns a `questions[]` array.
 *
 * Unlike job details, there is NO fixed set of fields — every posting asks different things,
 * and there can be any number of them. So the model returns a dynamic array; the UI renders
 * each entry as the right control (text, dropdown, radio, number, link…) from its `type`.
 *
 * normalizeApplicationQuestions() is a thin safety net over the model's JSON: keep only the
 * keys we asked for, coerce types to the allowed set, clamp lengths/counts, and drop entries
 * that carry no usable label — so malformed model output can't reach the UI.
 */

import { SHARED_EXTRACTION_SYSTEM, pageBlock } from "@/lib/llm/extraction"

/** Control types the UI knows how to render. `short_text` is the safe fallback. */
export const APPLICATION_FIELD_TYPES = [
  "short_text",
  "long_text",
  "select",
  "radio",
  "multi_select",
  "checkbox",
  "number",
  "url",
  "email",
  "tel",
  "date",
  "file",
] as const

export type ApplicationFieldType = (typeof APPLICATION_FIELD_TYPES)[number]

/** A single application question, shaped for direct rendering by the extension UI. */
export type ApplicationQuestion = {
  /** The question / field label as shown to the candidate. */
  label: string
  /** Which control to render. */
  type: ApplicationFieldType
  /** The input's placeholder/ghost text, when the form showed one. */
  placeholder?: string
  /** Sub-label, hint, or helper text shown under the field. */
  helpText?: string
  /** Whether the form marked this field required (e.g. an asterisk or "required"). */
  required?: boolean
  /** Choices for select/radio/multi_select/checkbox. Omitted for free-entry types. */
  options?: string[]
  /** User-set star: this question is flagged for later review. Not produced by the LLM —
   *  set by the user in the save panel and persisted alongside the extracted shape. */
  flagged?: boolean
}

export type ApplicationExtraction = { questions: ApplicationQuestion[] }

const TYPES_LIST = APPLICATION_FIELD_TYPES.join(", ")

// Heavy, example-led guidance. The model is good at reading a form; we anchor the field
// types, the placeholder vs label distinction, and how to read options/required so the
// output renders cleanly without UI guesswork.
const FIELD_GUIDE = [
  `type: the control to render. One of: ${TYPES_LIST}.`,
  "  • short_text  → a single-line free-text box. Keywords: name, first/last name, headline, current title, city, how did you hear about us. <input type=text> with no special semantics.",
  "  • long_text   → a multi-line answer. Keywords: cover letter, why do you want to work here, describe your experience, tell us about, additional information. <textarea>, or a prompt that clearly wants a paragraph.",
  "  • select      → pick ONE from a fixed list shown as a dropdown. Source the choices from <select><option> or an explicitly listed set. Keywords: country, years of experience, how did you hear about us (with a list), notice period.",
  "  • radio       → pick ONE from a SMALL set of mutually exclusive choices shown inline (radio buttons). Keywords: are you authorized to work?, do you require sponsorship?, yes/no questions with radios.",
  "  • multi_select → pick MANY from a dropdown/list. Keywords: select all that apply (dropdown style), skills, technologies.",
  "  • checkbox    → one or more independent checkboxes. A single checkbox = an acknowledgement/consent (label is the statement). Multiple = select-all-that-apply. Keywords: I agree to…, I consent…, select all that apply.",
  "  • number      → a numeric answer. Keywords: years of experience, desired salary, expected compensation, GPA, age. Use number only when the form expects digits, not a labelled dropdown.",
  '  • url         → a link. Keywords: LinkedIn, GitHub, portfolio, personal website, profile URL. Input often shows a placeholder like "https://…".',
  "  • email       → an email address field.",
  "  • tel         → a phone number field.",
  "  • date        → a date field. Keywords: available start date, date of birth, earliest start.",
  "  • file        → an upload. Keywords: resume, CV, cover letter (upload), transcript, portfolio (file). Render the control; the user attaches the file themselves.",
  "label: the question/field caption exactly as the candidate reads it (e.g. \"LinkedIn profile\", \"Are you legally authorized to work in the US?\"). Strip a trailing required asterisk from the label and set required:true instead.",
  'placeholder: the input\'s ghost/placeholder text ONLY (the faint example text inside an empty box, e.g. "https://linkedin.com/in/…", "you@example.com", "e.g. 5"). This is NOT the label. Omit if the field had no placeholder.',
  "helpText: any small helper/hint/sub-label shown with the field (e.g. \"PDF or DOCX, max 5MB\", \"Include country code\"). Omit if none.",
  "required: true only if the form marks the field required (asterisk *, the word \"required\", aria-required). Otherwise omit (treated as optional).",
  "options: for select/radio/multi_select/checkbox, the exact choice labels as an array of strings, in the order shown. Omit for all other types. Drop a leading empty/\"Select…\" placeholder option.",
].join("\n- ")

// Concrete few-shot so the model copies the SHAPE, not just the rules. Kept compact.
const EXAMPLE = `Example — given a form asking for a full name, LinkedIn URL, years of React experience, work authorization (Yes/No radios), a country dropdown, a cover letter, a resume upload, and a consent checkbox, return:
{"questions":[
  {"label":"Full name","type":"short_text","placeholder":"Jane Doe","required":true},
  {"label":"LinkedIn profile","type":"url","placeholder":"https://linkedin.com/in/…"},
  {"label":"Years of experience with React","type":"number","placeholder":"e.g. 5","required":true},
  {"label":"Are you authorized to work in the US?","type":"radio","options":["Yes","No"],"required":true},
  {"label":"Country","type":"select","options":["United States","Canada","United Kingdom"],"required":true},
  {"label":"Cover letter","type":"long_text","helpText":"Tell us why you're a fit"},
  {"label":"Resume / CV","type":"file","helpText":"PDF or DOCX","required":true},
  {"label":"I consent to my data being processed for this application","type":"checkbox","required":true}
]}`

export type ChatMessage = { role: "system" | "user"; content: string }

// Build the chat messages for an OpenAI-compatible chat-completions call (Groq).
// Page FIRST (shared cached prefix), application task SECOND. The system text and pageBlock()
// are imported from extraction.ts so this prefix is byte-identical to the details call (see the
// caching note there). The form-specific guidance — ignore nav/login/cookie/submit, empty array
// when there's no form — lives here, after the page, so it never enters the shared prefix.
export function buildApplicationMessages(text: string): ChatMessage[] {
  const user =
    pageBlock(text) +
    "\n\nFrom the page above, extract every application-form question — the fields a candidate " +
    "must fill in. For each, return an object with:\n- " +
    FIELD_GUIDE +
    "\n\n" +
    EXAMPLE +
    "\n\nFind every form field the candidate is expected to fill in. Ignore page navigation, the " +
    "job description, marketing copy, cookie/consent banners, login/search boxes, and the " +
    'submit/cancel buttons themselves. Return a JSON object of the form {"questions":[ ... ]} and ' +
    'nothing else. If the page has no application form, return {"questions":[]}.'
  return [
    { role: "system", content: SHARED_EXTRACTION_SYSTEM },
    { role: "user", content: user },
  ]
}

// Caps match the extension harvest (MAX_FIELDS = 200, MAX_OPTIONS = 60 in ui/application.js)
// and the storage validation (lib/validations/job.ts): the indexed path feeds VERBATIM DOM
// data through this sieve, so a cap below the harvest's would silently truncate real options
// (e.g. a country dropdown's tail). Still bounded — this remains the anti-runaway backstop.
const MAX_QUESTIONS = 200
const MAX_OPTIONS = 60
const MAX_LABEL = 400
const MAX_SHORT = 300
const TYPES_WITH_OPTIONS = new Set<ApplicationFieldType>([
  "select",
  "radio",
  "multi_select",
  "checkbox",
])

/** Parse the model's JSON reply into a clean, render-ready question list. */
export function normalizeApplicationQuestions(raw: unknown): ApplicationExtraction {
  const obj = asObject(raw)
  const list = obj && Array.isArray(obj.questions) ? obj.questions : []
  const questions: ApplicationQuestion[] = []

  for (const entry of list) {
    if (questions.length >= MAX_QUESTIONS) break
    const q = normalizeQuestion(entry)
    if (q) questions.push(q)
  }
  return { questions }
}

function normalizeQuestion(raw: unknown): ApplicationQuestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const label = cleanString(r.label, MAX_LABEL)
  if (!label) return null // a question with no caption is useless to the UI

  const type = normalizeType(r.type)
  const q: ApplicationQuestion = { label, type }

  const placeholder = cleanString(r.placeholder, MAX_SHORT)
  if (placeholder && placeholder.toLowerCase() !== label.toLowerCase()) {
    q.placeholder = placeholder
  }

  const helpText = cleanString(r.helpText, MAX_SHORT)
  if (helpText) q.helpText = helpText

  if (r.required === true) q.required = true

  if (TYPES_WITH_OPTIONS.has(type)) {
    const options = normalizeOptions(r.options)
    if (options.length) q.options = options
  }
  return q
}

function normalizeType(raw: unknown): ApplicationFieldType {
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase()
    const match = APPLICATION_FIELD_TYPES.find((t) => t === v)
    if (match) return match
  }
  return "short_text"
}

function normalizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (out.length >= MAX_OPTIONS) break
    const v = cleanString(item, MAX_SHORT)
    if (!v) continue
    // Drop leading placeholder options like "Select…" / "Please choose".
    if (out.length === 0 && /^(select|choose|please|--)/i.test(v)) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  const v = value.trim()
  if (!v || /^(null|n\/a|none|undefined)$/i.test(v)) return ""
  return v.length > max ? v.slice(0, max) : v
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    // Models sometimes wrap JSON in prose/fences; grab the first {...} block.
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      const parsed = JSON.parse(m[0])
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
}
