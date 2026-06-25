import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronsUpDown,
  CircleDot,
  Hash,
  Link2,
  ListChecks,
  Mail,
  Paperclip,
  Phone,
  Type,
  type LucideIcon,
} from "lucide-react"

import type { ApplicationFieldType } from "@/lib/llm/application-extraction"

/**
 * The persisted shape of one application question (see `shapeStoredQuestions` in
 * lib/server/jobs.ts). The DB column is `Json`, so the page parses it through
 * `parseQuestions` into this typed shape before rendering.
 */
export type StoredQuestion = {
  id: string
  order: number
  label: string
  type: ApplicationFieldType
  required?: boolean
  placeholder?: string
  helpText?: string
  options?: string[]
  flagged?: boolean
}

/**
 * Per-type rendering metadata: the icon that marks the field's kind, a human label for
 * that kind, and `aiDraftable` — whether the field is worth offering an AI draft for.
 * Only the textarea type (`long_text`) is draftable: AI drafting is for paragraph-style
 * answers. Short single-line text (often a name, title, or one-liner), every choice/upload
 * field, and every typed scalar (email/phone/number/date/url) are NOT — see `canAiDraft`.
 */
export const FIELD_META: Record<
  ApplicationFieldType,
  { icon: LucideIcon; kind: string; aiDraftable: boolean }
> = {
  short_text: { icon: Type, kind: "Short answer", aiDraftable: false },
  long_text: { icon: AlignLeft, kind: "Long answer", aiDraftable: true },
  select: { icon: ChevronsUpDown, kind: "Dropdown", aiDraftable: false },
  radio: { icon: CircleDot, kind: "Single choice", aiDraftable: false },
  multi_select: { icon: ListChecks, kind: "Multi-select", aiDraftable: false },
  checkbox: { icon: CheckSquare, kind: "Checklist", aiDraftable: false },
  number: { icon: Hash, kind: "Number", aiDraftable: false },
  url: { icon: Link2, kind: "Link", aiDraftable: false },
  email: { icon: Mail, kind: "Email", aiDraftable: false },
  tel: { icon: Phone, kind: "Phone", aiDraftable: false },
  date: { icon: Calendar, kind: "Date", aiDraftable: false },
  file: { icon: Paperclip, kind: "File upload", aiDraftable: false },
}

// Identity / contact / logistics prompts that sometimes arrive mis-typed as a textarea (e.g. an
// address box). There's nothing to "draft" for these, so we suppress the AI button on them even
// when the type would otherwise qualify. Matched as whole words against the lowercased label.
const NON_DRAFTABLE_LABEL = [
  "name",
  "first name",
  "last name",
  "full name",
  "email",
  "e-mail",
  "phone",
  "mobile",
  "telephone",
  "address",
  "street",
  "city",
  "state",
  "zip",
  "postal",
  "country",
  "linkedin",
  "github",
  "portfolio",
  "website",
  "url",
  "salary",
  "compensation",
  "date of birth",
  "start date",
]

/**
 * Deterministic gate for the AI-draft button: shown ONLY for the textarea type (`long_text`), and
 * never for an identity/contact field even if it slipped in as a textarea. This is the single
 * source of truth so the UI and the server stay in agreement about what is draftable.
 */
export function canAiDraft(question: StoredQuestion): boolean {
  if (!FIELD_META[question.type].aiDraftable) return false
  const label = question.label.toLowerCase()
  return !NON_DRAFTABLE_LABEL.some((term) =>
    new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`).test(label),
  )
}

const VALID_TYPES = new Set(Object.keys(FIELD_META))

/**
 * Parse the `JobApplication.questions` JSON into render-ready questions. Defensive by
 * design — the column is open-ended JSON, so we keep only well-formed entries (a string
 * `label` and a known `type`) and sort by `order`. Anything malformed is dropped rather
 * than crashing the page.
 */
export function parseQuestions(raw: unknown): StoredQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: StoredQuestion[] = []
  raw.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") return
    const q = entry as Record<string, unknown>
    if (typeof q.label !== "string" || typeof q.type !== "string") return
    if (!VALID_TYPES.has(q.type)) return
    out.push({
      id: typeof q.id === "string" ? q.id : `q-${i}`,
      order: typeof q.order === "number" ? q.order : i,
      label: q.label,
      type: q.type as ApplicationFieldType,
      required: q.required === true,
      placeholder: typeof q.placeholder === "string" ? q.placeholder : undefined,
      helpText: typeof q.helpText === "string" ? q.helpText : undefined,
      options: Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === "string")
        : undefined,
      flagged: q.flagged === true,
    })
  })
  return out.sort((a, b) => a.order - b.order)
}
