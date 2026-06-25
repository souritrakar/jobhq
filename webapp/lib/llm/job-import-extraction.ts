/**
 * Firecrawl import: the JSON schemas + extraction prompts we hand to Firecrawl, and the
 * mappers that turn its raw output back into our existing normalized shapes. Pure, no I/O.
 *
 * This is the "save a job from a URL" sibling of extraction.ts / application-extraction.ts.
 * The extension path captures a page's text and runs our Groq prompts; this path hands the
 * SAME rules to Firecrawl's own LLM as a schema + prompt, so one /v2/scrape call returns
 * every field we store — job details, description, AND the application questions — with no
 * added Groq spend. We then reuse the existing normalizers so the persisted shape is
 * byte-for-byte what the extension produces.
 *
 * Two extraction configs share ONE question shape:
 *   - JOB_IMPORT_*         — the full posting (details + description + application questions).
 *                            Used for the URL the user pastes first.
 *   - APPLICATION_IMPORT_* — application questions ONLY, with no job-posting gate. Used for a
 *                            SECOND URL when a job's apply form lives on a separate page/route
 *                            (e.g. Ashby's `…/<id>/application`): we scrape just the form and
 *                            attach it to the already-saved job.
 */

import {
  APPLICATION_FIELD_TYPES,
  normalizeApplicationQuestions,
  type ApplicationQuestion,
} from "@/lib/llm/application-extraction"
import {
  EXTRACTION_FIELDS,
  normalizeExtractedFields,
  type ExtractedJob,
} from "@/lib/llm/extraction"
import type { FirecrawlBranding } from "@/lib/llm/firecrawl"

// The canonical value sets the model must choose from for the two enum-style fields. Kept
// here in sync with the FIELD_GUIDE in extraction.ts (the source of truth for the wording).
const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
  "Temporary",
  "Freelance",
  "Volunteer",
  "Apprenticeship",
] as const
const WORKPLACE_TYPES = ["Remote", "Hybrid", "On-site"] as const

const TYPES_LIST = APPLICATION_FIELD_TYPES.join(", ")

/**
 * JSON Schema for a single application-form question. Shared by both extraction configs so the
 * form shape is defined once (mirrors ApplicationQuestion in application-extraction.ts).
 */
const QUESTION_ITEM_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    label: {
      type: "string",
      description: "The question/field caption exactly as the candidate reads it. Strip a trailing required asterisk and set required:true instead.",
    },
    type: {
      type: "string",
      enum: [...APPLICATION_FIELD_TYPES],
      description: "The control to render for this field.",
    },
    placeholder: {
      type: ["string", "null"],
      description: "The input's ghost/placeholder text only (not the label). null if none.",
    },
    helpText: {
      type: ["string", "null"],
      description: "Any small helper/hint/sub-label shown with the field. null if none.",
    },
    required: {
      type: ["boolean", "null"],
      description: "true only if the form marks the field required (asterisk, 'required', aria-required).",
    },
    options: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "For select/radio/multi_select/checkbox: the exact choice labels in order. null for other types.",
    },
  },
  required: ["label", "type"],
}

/**
 * JSON Schema for Firecrawl's `json` format on the FULL posting. Mirrors EXTRACTION_FIELDS plus
 * the ApplicationQuestion shape, so a single extraction returns both. Every job field is
 * nullable (the model returns null when a detail is genuinely absent); `applicationQuestions`
 * is required but may be an empty array (many posting pages have no inline form).
 */
export const JOB_IMPORT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: {
      type: ["string", "null"],
      description: "The role title only, e.g. 'Senior Backend Engineer'. Not the company or a tagline.",
    },
    company: {
      type: ["string", "null"],
      description: "The hiring company's name only.",
    },
    location: {
      type: ["string", "null"],
      description: "Where the role is based, as stated (e.g. 'Remote', 'London (Hybrid)'). null if absent.",
    },
    salary: {
      type: ["string", "null"],
      description: "The pay exactly as written — currency, amounts, and period. Never convert or estimate. null if not stated.",
    },
    employmentType: {
      type: ["string", "null"],
      enum: [...EMPLOYMENT_TYPES, null],
      description: "One of the listed employment types, or null if not stated.",
    },
    workplaceType: {
      type: ["string", "null"],
      enum: [...WORKPLACE_TYPES, null],
      description: "Remote, Hybrid, or On-site — or null if not stated.",
    },
    description: {
      type: ["string", "null"],
      description: "The job description body, cleaned of navigation/boilerplate but kept faithful to the posting. Preserve paragraphs and bullet points.",
    },
    applicationQuestions: {
      type: "array",
      description: "Every question/field in the application FORM on the page (not the description). Empty array if the page shows no application form.",
      items: QUESTION_ITEM_SCHEMA,
    },
  },
  required: ["title", "company", "description", "applicationQuestions"],
}

/**
 * JSON Schema for the APPLICATION-ONLY extraction (the second URL). No job-detail fields — the
 * apply page may not repeat them — just the form questions.
 */
export const APPLICATION_IMPORT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    applicationQuestions: {
      type: "array",
      description: "Every question/field the candidate must fill in on this application form. Empty array if the page shows no form.",
      items: QUESTION_ITEM_SCHEMA,
    },
  },
  required: ["applicationQuestions"],
}

// Shared field-by-field guidance for reading an application FORM. Identical between the full
// and application-only prompts, so the model interprets question types the same way in both.
const APPLICATION_FORM_GUIDE = [
  `- type: the control to render — one of: ${TYPES_LIST}.`,
  "    short_text = single-line free text (name, headline, city). long_text = a paragraph (cover letter, 'why do you want to work here').",
  "    select = pick ONE from a dropdown list (source options from the choices shown). radio = pick ONE from a small inline set (yes/no, work authorization).",
  "    multi_select = pick MANY from a list. checkbox = independent checkbox(es); a single one is a consent/acknowledgement (label = the statement).",
  "    number = a numeric answer (years of experience, desired salary). url = a link (LinkedIn, GitHub, portfolio). email / tel / date as appropriate.",
  "    file = an upload (resume, CV, transcript). Use short_text when unsure.",
  "- label: the caption exactly as shown. Strip a trailing required asterisk from the label and set required:true instead.",
  "- placeholder: the faint example text inside an empty input ONLY (e.g. 'you@example.com', 'https://linkedin.com/in/…'). This is NOT the label. null if none.",
  "- helpText: any small hint/sub-label shown with the field (e.g. 'PDF or DOCX, max 5MB'). null if none.",
  "- required: true only if the form marks the field required. Otherwise null.",
  "- options: for select/radio/multi_select/checkbox, the exact choice labels as an array in the order shown. Drop a leading 'Select…' placeholder option. null for all other types.",
  "",
  "FORMAT EXAMPLE — illustrative ONLY. It shows the JSON shape for a form asking full name, LinkedIn URL, years of React experience, work authorization (Yes/No), a country dropdown, a cover letter, a resume upload, and a consent checkbox. These values are FICTIONAL: never copy any of them into your answer — output a question only if it actually appears in THIS page's form.",
  '[{"label":"Full name","type":"short_text","placeholder":"Jane Doe","required":true},',
  ' {"label":"LinkedIn profile","type":"url","placeholder":"https://linkedin.com/in/…"},',
  ' {"label":"Years of experience with React","type":"number","placeholder":"e.g. 5","required":true},',
  ' {"label":"Are you authorized to work in the US?","type":"radio","options":["Yes","No"],"required":true},',
  ' {"label":"Country","type":"select","options":["United States","Canada","United Kingdom"],"required":true},',
  ' {"label":"Cover letter","type":"long_text","helpText":"Tell us why you\'re a fit"},',
  ' {"label":"Resume / CV","type":"file","helpText":"PDF or DOCX","required":true},',
  ' {"label":"I consent to my data being processed for this application","type":"checkbox","required":true}]',
  "",
  "The example above is fictional and must not appear in your output unless those exact fields are really on the page.",
]

/**
 * The full-posting extraction prompt. It carries over every guardrail from our two Groq prompts
 * so accuracy matches the extension path: read only what the page states, never invent,
 * null/empty when absent; and read the application FORM separately from the description.
 */
export const JOB_IMPORT_PROMPT = [
  "You are reading a SINGLE job posting web page. Return its details and its application-form questions as JSON matching the provided schema.",
  "",
  "GLOBAL RULES:",
  "- Extract ONLY information that is literally present in the page text provided. If a detail is not on the page, it does not exist — return null. Never produce a plausible-sounding or made-up value.",
  "- NOT A JOB POSTING: if the page is not about a specific job at all — e.g. a company homepage, a careers index that lists many roles, a search-results page, a login/sign-up wall, an error/404 page, or a generic placeholder site — then set title and company to null and applicationQuestions to []. Do NOT invent a role, company, salary, or questions. Saving a fabricated job is a serious failure; returning nulls is the correct, safe answer.",
  "- APPLICATION / APPLY PAGE EXCEPTION: some links open the APPLY page for one specific job — a form to submit an application — without repeating the full job description. That is NOT the 'not a job posting' case. Extract every applicationQuestions field shown. Fill title/company if the apply page shows them; otherwise leave them null. Returning real questions with a null title/company here is correct and expected.",
  "- Never guess, infer, or invent a value, an option, or a placeholder. Copy text from the page; do not paraphrase facts into existence.",
  "- The page may include site navigation, related-jobs lists, and boilerplate — ignore those; describe only THIS posting.",
  "",
  "JOB DETAILS:",
  "- title: the role title only (e.g. 'Senior Backend Engineer'), not the company or a tagline.",
  "- company: the hiring company's name only.",
  "- location: where the role is based, as stated. Include remote if that's how it's described.",
  "- salary: the pay as written, with currency, amounts, and period — do not convert or estimate. null if not stated.",
  `- employmentType: one of ${EMPLOYMENT_TYPES.join(", ")} — or null.`,
  `- workplaceType: one of ${WORKPLACE_TYPES.join(", ")} — or null.`,
  "- description: the job description body, cleaned of navigation/boilerplate but otherwise faithful to the posting. Preserve its paragraphs and bullet points.",
  "",
  "APPLICATION FORM (applicationQuestions):",
  "- Find every field the candidate is expected to fill in on this page and describe it as a structured question.",
  "- IGNORE the job description, marketing copy, navigation, cookie/consent banners, login/search boxes, and the submit/cancel buttons themselves — none of those are application questions.",
  "- If the page contains no application form at all (the form is often behind a separate 'Apply' button on another page), return an empty applicationQuestions array. Do NOT fabricate generic questions.",
  ...APPLICATION_FORM_GUIDE,
  "If this page has no application form, applicationQuestions MUST be [].",
  "",
  "Return JSON only, with exactly the schema's keys.",
].join("\n")

/**
 * The application-only extraction prompt (second URL). Same form-reading rules as above, but
 * NO job-posting gate: this page is expected to be an apply form, so it never needs a title,
 * company, or description to be present. The anti-fabrication rules are unchanged.
 */
export const APPLICATION_IMPORT_PROMPT = [
  "You are reading the APPLICATION / APPLY page for a single job — the form a candidate fills in to apply. Return ONLY its form questions as JSON matching the provided schema.",
  "",
  "RULES:",
  "- This page is an application form. You do NOT need a job description, title, or company to be present — just read the form.",
  "- Extract ONLY fields literally present on the page. Never invent a question, option, or placeholder. Copy text from the page; do not paraphrase fields into existence.",
  "- IGNORE navigation, any job description / marketing copy, cookie/consent banners, login/search boxes, and the submit/cancel buttons themselves — none of those are application questions.",
  "- If the page genuinely shows no application form (it failed to load, requires login, or is an unrelated page), return an empty applicationQuestions array. Do NOT fabricate generic questions.",
  ...APPLICATION_FORM_GUIDE,
  "If this page has no application form, applicationQuestions MUST be [].",
  "",
  "Return JSON only, with exactly the schema's keys.",
].join("\n")

/** The raw object Firecrawl returns at `data.json` for the full-posting schema. */
export type FirecrawlJobJson = Partial<
  Record<(typeof EXTRACTION_FIELDS)[number], string | null>
> & { applicationQuestions?: unknown }

/** The raw object Firecrawl returns at `data.json` for the application-only schema. */
export type FirecrawlApplicationJson = { applicationQuestions?: unknown }

/** Our normalized extraction: the same shapes the extension path produces. */
export type MappedImport = {
  fields: ExtractedJob
  questions: ApplicationQuestion[]
}

/**
 * Map Firecrawl's raw full-posting `json` output to our normalized field + question shapes,
 * reusing the existing normalizers so nulls/sentinels are dropped and question types/options
 * are coerced to the allowed set exactly as they are for an extension save.
 */
export function mapExtraction(raw: unknown): MappedImport {
  const obj = asRecord(raw)
  const fields = normalizeExtractedFields(obj)
  return { fields, questions: mapQuestions(obj) }
}

/**
 * Map the application-only `json` output to our normalized question list (no job fields). Used
 * when attaching a separate apply page's form to an existing job.
 */
export function mapApplicationExtraction(raw: unknown): ApplicationQuestion[] {
  return mapQuestions(asRecord(raw))
}

// normalizeApplicationQuestions reads `obj.questions`; Firecrawl returns `applicationQuestions`.
function mapQuestions(obj: Record<string, unknown>): ApplicationQuestion[] {
  return normalizeApplicationQuestions({ questions: obj.applicationQuestions }).questions
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

// Job boards whose pages are dominated by the site's OWN chrome — on these, the branding
// detector grabs the SITE's logo (e.g. LinkedIn's), not the hiring company's. Better to show
// no logo (the UI falls back to a company-initial tile) than the wrong one. Embedded ATS
// boards (Greenhouse, Lever, Ashby, Workday…) are intentionally NOT here: their posting pages
// render the company's own logo, which branding captures correctly.
const CHROME_AGGREGATORS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "dice.com",
  "simplyhired.com",
  "naukri.com",
  "google.com",
  "bing.com",
]

/**
 * Choose a company logo URL from Firecrawl's branding profile, with two accuracy guards:
 *   1. Suppress the logo entirely when the posting is on a chrome-heavy aggregator (above).
 *   2. Accept only real http(s) image URLs — reject data: URIs (huge inline SVGs that also
 *      blow the 2000-char logoUrl cap) and anything non-http.
 * Returns undefined when there's no usable logo.
 */
export function pickLogoUrl(
  branding: FirecrawlBranding | null,
  sourceUrl: string,
): string | undefined {
  if (isAggregatorHost(hostOf(sourceUrl))) return undefined
  if (!branding) return undefined
  for (const candidate of [branding.logo, branding.images?.logo]) {
    const url = cleanLogoUrl(candidate)
    if (url) return url
  }
  return undefined
}

function cleanLogoUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim()
  if (!/^https?:\/\//i.test(v)) return undefined // reject data:/blob:/relative
  if (v.length > 2000) return undefined // matches the logoUrl column/validation cap
  return v
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

function isAggregatorHost(host: string | null): boolean {
  if (!host) return false
  return CHROME_AGGREGATORS.some((d) => host === d || host.endsWith(`.${d}`))
}
