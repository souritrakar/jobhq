/**
 * Job-extraction prompt + output shaping — pure, no I/O.
 *
 * First-principles pipeline: the extension sends the page's readable text and we make
 * ONE model call that returns every field we store — including the description — as a
 * single JSON object. No per-site scoping, no second model, no deterministic backstops.
 * The model is good at reading a messy posting; we let it do that job in one shot and
 * iterate from here.
 *
 * normalizeExtractedFields() is a thin safety net over the model's JSON: keep only the
 * keys we asked for, coerce to trimmed strings, drop empty/sentinel values so a "null"
 * or "N/A" can't leak into a saved job. That's it — no formatting heuristics.
 */

/** The fields the model returns. `description` is the full posting body, lightly cleaned. */
export const EXTRACTION_FIELDS = [
  "title",
  "company",
  "location",
  "salary",
  "employmentType",
  "workplaceType",
  "description",
] as const

export type ExtractionField = (typeof EXTRACTION_FIELDS)[number]
export type ExtractedJob = Partial<Record<ExtractionField, string>>

// Prompt caching seam (Groq GPT-OSS). Both extraction prompts — this module's field reader
// and application-extraction.ts's form reader — share this exact system text AND wrap the
// page with the exact same pageBlock(). Render order is system → user, so the byte-identical
// prefix is [SHARED_EXTRACTION_SYSTEM] + [pageBlock(page)]; only the task-specific instructions
// after the page differ. That makes the captured page the *shared cached prefix*: the details
// call writes it, and the application call on the same posting reads it cheaply. Keep this
// string and pageBlock() identical across both modules — any drift breaks the cache.
export const SHARED_EXTRACTION_SYSTEM =
  "You read a single job posting page and return structured data as JSON. The input is " +
  "simplified markdown converted from a rendered web page: headings, lists, and link text " +
  "carry content, and form controls are encoded as compact markers — [text], [long text], " +
  "[dropdown: a | b], (radio), (checkbox), [image: …]. The page may include surrounding site " +
  "navigation and boilerplate. Use only what the input actually states — never guess, infer, " +
  "or invent. For anything genuinely not present, use null (or an empty result). Output JSON " +
  "only, no prose."

/** Wrap the captured page identically for both prompts — this is the cached prefix. */
export function pageBlock(text: string): string {
  return 'Job posting page:\n"""\n' + String(text ?? "").trim() + '\n"""'
}

const FIELD_GUIDE = [
  'title: the role title only (e.g. "Senior Backend Engineer"), not the company or a tagline.',
  "company: the hiring company's name only.",
  "location: where this role is based, as stated. Include remote if that's how it's described (e.g. \"Remote\", \"London (Hybrid)\").",
  "salary: the pay as written, with currency, amounts, and period — do not convert or estimate. null if not stated.",
  "employmentType: one of Full-time, Part-time, Contract, Internship, Temporary, Freelance, Volunteer, Apprenticeship — or null.",
  "workplaceType: one of Remote, Hybrid, On-site — or null.",
  "description: the job description body, cleaned of navigation/boilerplate but otherwise kept faithful to the posting. Preserve its paragraphs and bullet points.",
].join("\n- ")

export type ChatMessage = { role: "system" | "user"; content: string }

// Build the chat messages for an OpenAI-compatible chat-completions call (Groq).
// The page goes FIRST (shared cached prefix), the field task SECOND — see the caching note
// on SHARED_EXTRACTION_SYSTEM above.
export function buildExtractionMessages(text: string): ChatMessage[] {
  const user =
    pageBlock(text) +
    "\n\nFrom the page above, extract the following fields:\n- " +
    FIELD_GUIDE +
    "\n\nReturn a JSON object with exactly these keys: " +
    EXTRACTION_FIELDS.join(", ") +
    " (value null when absent)."
  return [
    { role: "system", content: SHARED_EXTRACTION_SYSTEM },
    { role: "user", content: user },
  ]
}

/** Parse the model's JSON reply into a clean ExtractedJob: allowed keys, trimmed, no empties. */
export function normalizeExtractedFields(raw: unknown): ExtractedJob {
  const obj = asObject(raw)
  if (!obj) return {}
  const out: ExtractedJob = {}
  for (const key of EXTRACTION_FIELDS) {
    const value = obj[key]
    if (typeof value !== "string") continue
    const v = value.trim()
    if (!v || /^(null|n\/a|none|unknown|not specified)$/i.test(v)) continue
    out[key] = v
  }
  return out
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
