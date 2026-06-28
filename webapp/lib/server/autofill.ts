import { APPLICATION_FIELD_TYPES, type ApplicationFieldType } from "@/lib/llm/application-extraction"
import { decodeMultiValue, isMultiValue } from "@/lib/application/answer-codec"
import {
  defaultValueForType,
  matchQuestionsToFields,
  resolveChoice,
  type FieldDescriptor,
  type FieldMatch,
  type QuestionDescriptor,
} from "@/lib/application/field-matching"
import { embed } from "@/lib/llm/embeddings"
import { getApplicationAnswers } from "@/lib/server/application-answers"
import { getJob } from "@/lib/server/jobs"
import { getProfile } from "@/lib/server/profile"
import type { ProfileSettings } from "@/components/dashboard/settings/profile-settings"
import type { DomFieldInput } from "@/lib/validations/autofill"

/**
 * Autofill service: turn a page's harvested input fields + a job's SAVED application answers into a
 * concrete fill plan for the extension. All DB access is userId-scoped (via getJob / getApplicationAnswers).
 *
 * Direction is question → field (see field-matching): we match each saved question to its field on the
 * page, so a page that changed since the answers were saved degrades gracefully — a question with no
 * field comes back in `unmatched` (the extension reports it) rather than being mis-filled. A question
 * with no saved answer is filled with a typed default stand-in (flagged `isDefault`). `file` questions
 * are out of scope and never participate.
 */

const VALID_TYPES: ReadonlySet<string> = new Set(APPLICATION_FIELD_TYPES)

type ServiceQuestion = {
  id: string
  label: string
  type: ApplicationFieldType
  helpText?: string
  options?: string[]
}

/** One field to fill on the page. Both shapes are sent so the extension fills by the DOM field's kind:
 *  text-like controls use `value`; choice controls use `optionValues` (resolved to the page's options). */
export type AutofillInstruction = {
  questionId: string
  fieldId: string
  value: string
  optionValues: string[]
  /** True when this is a typed placeholder (no saved answer) — the extension highlights it for review. */
  isDefault: boolean
  /** Which source produced this fill: a saved per-job answer, or the user's standing autofill profile. */
  source: "answer" | "profile"
  score: number
}

export type UnmatchedQuestion = { questionId: string; label: string }

export type AutofillPlan = {
  matched: AutofillInstruction[]
  unmatched: UnmatchedQuestion[]
}

/**
 * Defensive parse of the application's questions JSON into the fields this service needs. Mirrors the
 * local-parser pattern used elsewhere in lib/server/* (questionIdSet, findQuestion) — keeps the service
 * decoupled from the client question module.
 */
function parseServiceQuestions(raw: unknown): ServiceQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: ServiceQuestion[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const q = entry as Record<string, unknown>
    if (typeof q.id !== "string" || typeof q.label !== "string") continue
    if (typeof q.type !== "string" || !VALID_TYPES.has(q.type)) continue
    out.push({
      id: q.id,
      label: q.label,
      type: q.type as ApplicationFieldType,
      helpText: typeof q.helpText === "string" ? q.helpText : undefined,
      options: Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === "string")
        : undefined,
    })
  }
  return out
}

/**
 * The user's standing autofill profile as autofill candidates. Each entry becomes a pseudo-question
 * matched against page fields the per-job answers didn't claim (Layer 2). `label` is the natural-language
 * text we embed (so the matcher absorbs label variance like "Email" / "Work email"); `type` shapes the
 * fill (text vs choice); `value` pulls the standing value out of the profile (and synthesizes full name).
 * Empty values are dropped in `profilePseudoQuestions` so a blank profile field never claims a field.
 */
const PROFILE_AUTOFILL_FIELDS: ReadonlyArray<{
  id: string
  label: string
  type: ApplicationFieldType
  value: (p: ProfileSettings) => string
}> = [
  { id: "profile:fullName", label: "Full name", type: "short_text", value: (p) => [p.firstName, p.lastName].filter(Boolean).join(" ") },
  { id: "profile:firstName", label: "First name", type: "short_text", value: (p) => p.firstName },
  { id: "profile:lastName", label: "Last name", type: "short_text", value: (p) => p.lastName },
  { id: "profile:preferredName", label: "Preferred name", type: "short_text", value: (p) => p.preferredName },
  { id: "profile:pronouns", label: "Pronouns", type: "select", value: (p) => p.pronouns },
  { id: "profile:email", label: "Email address", type: "email", value: (p) => p.email },
  { id: "profile:phone", label: "Phone number", type: "tel", value: (p) => p.phone },
  { id: "profile:streetAddress", label: "Street address", type: "short_text", value: (p) => p.streetAddress },
  { id: "profile:addressLine2", label: "Address line 2", type: "short_text", value: (p) => p.addressLine2 },
  { id: "profile:city", label: "City", type: "short_text", value: (p) => p.city },
  { id: "profile:state", label: "State or province", type: "short_text", value: (p) => p.state },
  { id: "profile:postalCode", label: "Postal or ZIP code", type: "short_text", value: (p) => p.postalCode },
  { id: "profile:country", label: "Country", type: "short_text", value: (p) => p.country },
  { id: "profile:workAuthorization", label: "Work authorization", type: "select", value: (p) => p.workAuthorization },
  { id: "profile:visaStatus", label: "Visa status", type: "short_text", value: (p) => p.visaStatus },
  { id: "profile:linkedinUrl", label: "LinkedIn profile URL", type: "url", value: (p) => p.linkedinUrl },
  { id: "profile:portfolioUrl", label: "Portfolio or website URL", type: "url", value: (p) => p.portfolioUrl },
  { id: "profile:githubUrl", label: "GitHub profile URL", type: "url", value: (p) => p.githubUrl },
  { id: "profile:currentTitle", label: "Current job title", type: "short_text", value: (p) => p.currentTitle },
  { id: "profile:currentCompany", label: "Current company", type: "short_text", value: (p) => p.currentCompany },
  // Voluntary EEO self-identification — opt-in, stored only if the user filled them in.
  { id: "profile:gender", label: "Gender", type: "select", value: (p) => p.gender },
  { id: "profile:raceEthnicity", label: "Race or ethnicity", type: "select", value: (p) => p.raceEthnicity },
  { id: "profile:veteranStatus", label: "Veteran status", type: "select", value: (p) => p.veteranStatus },
  { id: "profile:disabilityStatus", label: "Disability status", type: "select", value: (p) => p.disabilityStatus },
]

/** A profile-derived autofill candidate: a ServiceQuestion carrying its standing value. */
export type ProfilePseudoQuestion = ServiceQuestion & { value: string }

/**
 * Turn the user's profile into autofill candidates — one per non-empty configured field. Returns []
 * for a null profile or one with nothing filled in. Pure (no DB) so it unit-tests directly.
 */
export function profilePseudoQuestions(profile: ProfileSettings | null): ProfilePseudoQuestion[] {
  if (!profile) return []
  const out: ProfilePseudoQuestion[] = []
  for (const def of PROFILE_AUTOFILL_FIELDS) {
    const value = def.value(profile).trim()
    if (value === "") continue
    out.push({ id: def.id, label: def.label, type: def.type, value })
  }
  return out
}

/** One field's value to fill plus whether it's a typed placeholder (no real value behind it). */
type FillValue = { value: string; isDefault: boolean }

/** Turn matched (question → field) pairs into concrete fill instructions, tagged with their source. */
function toInstructions(
  matched: FieldMatch[],
  questionById: Map<string, ServiceQuestion>,
  fieldById: Map<string, DomFieldInput>,
  fill: Map<string, FillValue>,
  source: AutofillInstruction["source"],
): AutofillInstruction[] {
  return matched.map((m) => {
    const q = questionById.get(m.questionId)!
    const f = fieldById.get(m.fieldId)!
    const fv = fill.get(m.questionId)!
    // Plain-text form for text-like DOM fields; joined for a multi-value answer.
    const value = isMultiValue(q) ? decodeMultiValue(fv.value).join(", ") : fv.value
    // Resolved page-option value(s) for a DOM field that offers options (select/radio/checkbox).
    const optionValues = f.options?.length ? resolveChoice(fv.value, q, f.options) : []
    return { questionId: m.questionId, fieldId: m.fieldId, value, optionValues, isDefault: fv.isDefault, source, score: m.score }
  })
}

export async function buildAutofillPlan(
  userId: string,
  jobId: string,
  fields: DomFieldInput[],
): Promise<AutofillPlan> {
  // getJob enforces ownership (404s on a foreign/unknown id) and includes the application form.
  const job = await getJob(userId, jobId)
  const questions = parseServiceQuestions(job.application?.questions)
  const fillable = questions.filter((q) => q.type !== "file") // file is out of scope

  const fieldById = new Map(fields.map((f) => [f.id, f]))
  const fDescriptors: FieldDescriptor[] = fields.map((f) => ({ fieldId: f.id, label: f.label }))

  // --- Layer 1: saved per-job answers → fields (these claim their fields first) ------------------
  let l1Matched: FieldMatch[] = []
  let unmatchedQuestionIds: string[] = []
  const questionById = new Map(fillable.map((q) => [q.id, q]))
  const l1Fill = new Map<string, FillValue>()
  if (fillable.length > 0) {
    // Server reloads the answers from the DB — never trusts client-sent values.
    const answers = await getApplicationAnswers(userId, jobId)
    for (const q of fillable) {
      const saved = answers[q.id]
      // The saved answer, or a typed default stand-in (flagged) when unanswered.
      l1Fill.set(
        q.id,
        saved && saved.trim() !== ""
          ? { value: saved, isDefault: false }
          : { value: defaultValueForType(q), isDefault: true },
      )
    }
    const qDescriptors: QuestionDescriptor[] = fillable.map((q) => ({
      questionId: q.id,
      label: q.label,
      helpText: q.helpText,
    }))
    const res = await matchQuestionsToFields(qDescriptors, fDescriptors, embed)
    l1Matched = res.matched
    unmatchedQuestionIds = res.unmatchedQuestionIds
  }
  const claimedFieldIds = new Set(l1Matched.map((m) => m.fieldId))

  // --- Layer 2: standing autofill profile → fields Layer 1 didn't claim --------------------------
  // Best-effort: a profile read failure must not break per-job autofill (Layer 1 already succeeded).
  let profile: ProfileSettings | null = null
  try {
    profile = await getProfile(userId)
  } catch (err) {
    console.error("autofill: profile read failed; skipping profile layer", err)
  }
  const profileQs = profilePseudoQuestions(profile)
  const remainingFields = fields.filter((f) => !claimedFieldIds.has(f.id))
  let l2Matched: FieldMatch[] = []
  const l2QuestionById = new Map<string, ServiceQuestion>(profileQs.map((q) => [q.id, q]))
  const l2Fill = new Map<string, FillValue>(
    profileQs.map((q) => [q.id, { value: q.value, isDefault: false }]),
  )
  if (profileQs.length > 0 && remainingFields.length > 0) {
    const pDescriptors: QuestionDescriptor[] = profileQs.map((q) => ({ questionId: q.id, label: q.label }))
    const pfDescriptors: FieldDescriptor[] = remainingFields.map((f) => ({ fieldId: f.id, label: f.label }))
    const res = await matchQuestionsToFields(pDescriptors, pfDescriptors, embed)
    l2Matched = res.matched
  }

  const matched: AutofillInstruction[] = [
    ...toInstructions(l1Matched, questionById, fieldById, l1Fill, "answer"),
    ...toInstructions(l2Matched, l2QuestionById, fieldById, l2Fill, "profile"),
  ]

  // `unmatched` stays per-job-questions only — its meaning in the result modal is "you saved this
  // answer but we couldn't place it on the page". Profile fields are best-effort and not surfaced.
  const unmatched: UnmatchedQuestion[] = unmatchedQuestionIds.map((id) => ({
    questionId: id,
    label: questionById.get(id)?.label ?? id,
  }))

  return { matched, unmatched }
}
