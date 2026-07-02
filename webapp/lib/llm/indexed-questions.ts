/**
 * Indexed application-question extraction — classification merge (pure, no I/O).
 *
 * The LLM NEVER invents a question. It receives the page block doc plus the harvested field
 * manifest (real DOM controls with stable ids) and returns per-field DECISIONS: include?,
 * cleaned label, one of the 12 types, required?, helpText?. Everything authoritative comes
 * from the DOM harvest: options are copied verbatim by fieldId (they are not even in the LLM
 * output schema), placeholders come from the DOM, a DOM required:true can't be un-set, and a
 * type incompatible with the control's DOM kind snaps back to the DOM-derived default.
 * Consent/legal checkboxes (privacy policy, terms, marketing) are excluded — by prompt AND by
 * a deterministic keyword backstop, applied to checkbox-type questions only.
 */

import {
  APPLICATION_FIELD_TYPES,
  normalizeApplicationQuestions,
  type ApplicationFieldType,
  type ApplicationQuestion,
} from "@/lib/llm/application-extraction"
import type { Detected } from "@/lib/llm/indexed-details"
import {
  asObject,
  pagePrefixMessages,
  type CapturedBlock,
  type HarvestedField,
} from "@/lib/llm/indexed-shared"
import type { LlmMessage } from "@/lib/llm/openrouter"

export type IndexedQuestionsResult = {
  questions: ApplicationQuestion[]
  detected: Detected
}

const NATIVE_TYPE_WINS: Record<string, ApplicationFieldType> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
}

/** The type the control's DOM shape dictates when the LLM's choice is incompatible. */
export function domDefaultType(f: HarvestedField): ApplicationFieldType {
  switch (f.kind) {
    case "select":
      return "select"
    case "radio":
      return "radio"
    case "checkbox":
      return "checkbox"
    case "textarea":
    case "contenteditable":
      return "long_text"
    case "file":
      return "file"
    case "combobox":
      return "select"
    default: {
      const t = (f.inputType || "").toLowerCase()
      return NATIVE_TYPE_WINS[t] ?? "short_text"
    }
  }
}

/** LLM types allowed per DOM kind. Anything else snaps to domDefaultType(). */
function allowedTypes(f: HarvestedField): Set<ApplicationFieldType> {
  switch (f.kind) {
    case "select":
      return new Set<ApplicationFieldType>(["select", "multi_select"])
    case "radio":
      return new Set<ApplicationFieldType>(["radio"])
    case "checkbox":
      // a 2+-option group may be a select-all-that-apply; a lone checkbox stays a checkbox
      return (f.options?.length ?? 0) >= 2
        ? new Set<ApplicationFieldType>(["checkbox", "multi_select"])
        : new Set<ApplicationFieldType>(["checkbox"])
    case "textarea":
    case "contenteditable":
      return new Set<ApplicationFieldType>(["long_text"])
    case "file":
      return new Set<ApplicationFieldType>(["file"])
    case "combobox":
      return new Set<ApplicationFieldType>(["select", "short_text"])
    default: {
      const t = (f.inputType || "").toLowerCase()
      if (NATIVE_TYPE_WINS[t]) return new Set<ApplicationFieldType>([NATIVE_TYPE_WINS[t]]) // native type wins outright
      return new Set<ApplicationFieldType>([
        "short_text", "long_text", "number", "url", "email", "tel", "date",
      ])
    }
  }
}

const CONSENT_NOISE =
  /\b(privacy\s+(policy|notice|statement)|terms\s+(of|and|&)|t&c|consent|gdpr|data\s+(processing|protection)|newsletter|marketing\s+(emails?|communications?)|promotional)\b/i

/** Deterministic backstop for consent/legal noise. Applied to CHECKBOX questions only. */
export function isConsentNoise(label: string): boolean {
  return CONSENT_NOISE.test(label)
}

function renderFieldManifest(fields: HarvestedField[]): string {
  return fields
    .map((f) => {
      let s = `${f.id}: kind=${f.kind}`
      if (f.inputType) s += ` inputType=${f.inputType}`
      s += ` label="${f.label}"`
      if (f.required) s += " required"
      if (f.options?.length) {
        // Context only — options are copied verbatim from the harvest in the merge, so a huge
        // list (200-country dropdowns) is capped here rather than bloating the prompt.
        let joined = f.options.join(" | ")
        if (joined.length > 600) joined = joined.slice(0, 600) + " | …"
        s += ` options=[${joined}]`
      }
      if (f.placeholder) s += ` placeholder="${f.placeholder}"`
      return s
    })
    .join("\n")
}

const TYPES_LIST = APPLICATION_FIELD_TYPES.join(", ")

export function buildIndexedQuestionsMessages(
  blocks: CapturedBlock[],
  fields: HarvestedField[],
): LlmMessage[] {
  const task =
    "Below are the REAL form controls harvested from this page, one per line, keyed by field id " +
    "(they also appear in the page as [field <id>: …] markers, so you can read their surrounding " +
    "context above):\n\n" +
    renderFieldManifest(fields) +
    "\n\nClassify each field. Return JSON only:\n" +
    '{"hasApplicationForm": boolean, "questions": [{"fieldId": string, "include": boolean, ' +
    '"label": string, "type": string, "required": boolean, "helpText": string|null}]}\n' +
    "Rules:\n" +
    `- type: one of ${TYPES_LIST}. Choose what the QUESTION asks for (a text input asking for years of experience is "number"; a LinkedIn field is "url").\n` +
    "- include: true only for questions a candidate answers as part of APPLYING. Exclude page " +
    "noise (search boxes, login, newsletter signup, cookie banners) AND consent/legal " +
    "acknowledgements (privacy policy, terms of service, data-processing consent, marketing opt-ins).\n" +
    "- label: the question as the candidate reads it, cleaned (strip a trailing required asterisk; " +
    "fix broken casing/whitespace). Keep the meaning — do not rephrase.\n" +
    "- required: true if the form marks it required (asterisk, the word required, aria-required) — " +
    "read the page context, the DOM attribute may be missing.\n" +
    "- helpText: any hint/sub-label shown with the field (file-type limits, formatting guidance), or null.\n" +
    "- Do NOT return options — they are taken from the DOM.\n" +
    "- Return one entry per field id above; never invent a field id.\n" +
    "If the page has no real application form, return hasApplicationForm=false and questions=[]."
  return [...pagePrefixMessages(blocks), { role: "user", content: task }]
}

export const QUESTIONS_RESPONSE_FORMAT: Record<string, unknown> = {
  type: "json_schema",
  json_schema: {
    name: "application_questions",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        hasApplicationForm: { type: "boolean" },
        questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              fieldId: { type: "string" },
              include: { type: "boolean" },
              label: { type: "string" },
              type: { type: "string" },
              required: { type: "boolean" },
              helpText: { type: ["string", "null"] },
            },
            required: ["fieldId", "include", "label", "type", "required", "helpText"],
          },
        },
      },
      required: ["hasApplicationForm", "questions"],
    },
  },
}

export function resolveIndexedQuestions(
  raw: unknown,
  fields: HarvestedField[],
): IndexedQuestionsResult {
  const obj = asObject(raw)
  const byId = new Map(fields.map((f) => [f.id, f]))
  const order = new Map(fields.map((f, idx) => [f.id, idx]))
  const list = obj && Array.isArray(obj.questions) ? obj.questions : []

  type Decision = {
    fieldId: string
    include?: boolean
    label?: unknown
    type?: unknown
    required?: unknown
    helpText?: unknown
  }

  const kept: Array<{ field: HarvestedField; d: Decision }> = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue
    const d = entry as Decision
    const field = typeof d.fieldId === "string" ? byId.get(d.fieldId) : undefined
    if (!field || seen.has(field.id)) continue // unknown or duplicate id → rejected
    seen.add(field.id)
    if (d.include !== true) continue
    kept.push({ field, d })
  }

  kept.sort((a, b) => (order.get(a.field.id) ?? 0) - (order.get(b.field.id) ?? 0))

  const rawQuestions = kept
    .map(({ field, d }) => {
      const label = typeof d.label === "string" && d.label.trim() ? d.label.trim() : field.label
      // Type: native input type wins; else LLM's choice if compatible; else DOM default.
      const nativeWin = NATIVE_TYPE_WINS[(field.inputType || "").toLowerCase()]
      let type: ApplicationFieldType
      if (field.kind === "text" && nativeWin) {
        type = nativeWin
      } else {
        const proposed = typeof d.type === "string" ? (d.type.trim() as ApplicationFieldType) : null
        type = proposed && allowedTypes(field).has(proposed) ? proposed : domDefaultType(field)
      }
      if (type === "checkbox" && isConsentNoise(label)) return null // deterministic backstop
      const q: Record<string, unknown> = { label, type }
      if (field.required === true || d.required === true) q.required = true // DOM wins upward
      if (field.placeholder) q.placeholder = field.placeholder
      if (typeof d.helpText === "string" && d.helpText.trim()) q.helpText = d.helpText.trim()
      if (field.options?.length) q.options = field.options // VERBATIM from the DOM harvest
      return q
    })
    .filter(Boolean)

  // The existing sieve still runs (clamps, coercion safety net, options only on choice types).
  const { questions } = normalizeApplicationQuestions({ questions: rawQuestions })
  return {
    questions,
    detected: {
      hasJobDetails: false, // this task doesn't judge details; only the details task does
      hasApplicationForm: obj?.hasApplicationForm === true || questions.length > 0,
    },
  }
}
