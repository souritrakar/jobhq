/**
 * Indexed job-details extraction — prompt + deterministic resolution (pure, no I/O).
 *
 * The model reads the numbered block doc and answers with SMALL values plus a
 * descriptionRange POINTER; the description text itself is sliced verbatim from the blocks
 * here, so it cannot be truncated mid-sentence or hallucinated, and output stays ~100 tokens
 * regardless of page size. Small fields pass a normalized containment check against the page
 * text — a value that does not appear on the page is treated as hallucination and dropped.
 */

import { normalizeExtractedFields, type ExtractedJob } from "@/lib/llm/extraction"
import { asObject, pagePrefixMessages, type CapturedBlock } from "@/lib/llm/indexed-shared"
import type { LlmMessage } from "@/lib/llm/openrouter"

export type Detected = { hasJobDetails: boolean; hasApplicationForm: boolean }

export type IndexedDetailsResult = {
  fields: ExtractedJob
  description?: string
  detected: Detected
}

const EMPLOYMENT_TYPES = new Set([
  "Full-time", "Part-time", "Contract", "Internship", "Temporary", "Freelance",
  "Volunteer", "Apprenticeship",
])
const WORKPLACE_TYPES = new Set(["Remote", "Hybrid", "On-site"])

const DETAILS_TASK = [
  "From the page above, extract:",
  '- title: the role title only (e.g. "Senior Backend Engineer"). It may appear without any label — read the page text.',
  "- company: the hiring company's name only (often in the header, logo alt text, or page title).",
  '- location: where the role is based, as stated (e.g. "Remote", "London (Hybrid)").',
  "- salary: the pay EXACTLY as written, with currency and period — never convert or estimate.",
  "- employmentType: one of Full-time, Part-time, Contract, Internship, Temporary, Freelance, Volunteer, Apprenticeship — or null.",
  "- workplaceType: one of Remote, Hybrid, On-site — or null.",
  "- descriptionRange: the CONTIGUOUS block range holding the job description body (about the role," +
    " responsibilities, requirements, benefits) — {start, end, exclude} where exclude lists block" +
    " indices inside the range that are NOT description (ads, unrelated links). Choose the widest" +
    " honest range; do NOT include site navigation, the application form, or footer boilerplate." +
    " null if the page has no description.",
  "- hasJobDetails: does this page show a job posting's details?",
  "- hasApplicationForm: does this page show an application form a candidate fills in?",
  "Every string value must be copied verbatim from the page (or the page title). Use null when absent.",
].join("\n")

export function buildIndexedDetailsMessages(blocks: CapturedBlock[]): LlmMessage[] {
  return [...pagePrefixMessages(blocks), { role: "user", content: DETAILS_TASK }]
}

/** Strict schema — providers that support json_schema enforce it; others fall back to parsing. */
export const DETAILS_RESPONSE_FORMAT: Record<string, unknown> = {
  type: "json_schema",
  json_schema: {
    name: "job_details",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: ["string", "null"] },
        company: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        salary: { type: ["string", "null"] },
        employmentType: { type: ["string", "null"] },
        workplaceType: { type: ["string", "null"] },
        descriptionRange: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            start: { type: "integer" },
            end: { type: "integer" },
            exclude: { type: "array", items: { type: "integer" } },
          },
          required: ["start", "end", "exclude"],
        },
        hasJobDetails: { type: "boolean" },
        hasApplicationForm: { type: "boolean" },
      },
      required: [
        "title", "company", "location", "salary", "employmentType", "workplaceType",
        "descriptionRange", "hasJobDetails", "hasApplicationForm",
      ],
    },
  },
}

/** Case/whitespace/punctuation/unicode-insensitive containment. Empty normalization = no match. */
export function containsOnPage(value: string, haystack: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "")
  const v = norm(value)
  if (!v) return false
  return norm(haystack).includes(v)
}

/** Verbatim description slice: range minus excludes minus field blocks, markdown-shaped. */
export function renderDescription(
  blocks: CapturedBlock[],
  range: { start: number; end: number; exclude?: number[] },
): string | null {
  const start = Math.trunc(Number(range?.start))
  const end = Math.trunc(Number(range?.end))
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end >= blocks.length || start > end) return null
  const exclude = new Set((range.exclude || []).map((n) => Math.trunc(Number(n))))
  const parts: string[] = []
  for (const b of blocks) {
    if (b.i < start || b.i > end) continue
    if (exclude.has(b.i) || b.kind === "field") continue
    if (b.kind === "heading" || b.kind === "para") parts.push("\n\n" + b.text)
    else parts.push("\n" + b.text) // li / row stay line-per-item
  }
  const out = parts.join("").replace(/\n{3,}/g, "\n\n").trim()
  return out || null
}

export function resolveIndexedDetails(
  raw: unknown,
  blocks: CapturedBlock[],
  titleHint?: string,
): IndexedDetailsResult {
  const obj = asObject(raw)
  if (!obj) {
    return { fields: {}, detected: { hasJobDetails: false, hasApplicationForm: false } }
  }

  const pageText = blocks.map((b) => b.text).join("\n") + (titleHint ? "\n" + titleHint : "")

  const candidate: Record<string, unknown> = {}
  for (const key of ["title", "company", "location", "salary"] as const) {
    const v = obj[key]
    if (typeof v === "string" && v.trim() && containsOnPage(v, pageText)) {
      candidate[key] = v
    }
  }
  const et = obj.employmentType
  if (typeof et === "string" && EMPLOYMENT_TYPES.has(et.trim())) candidate.employmentType = et.trim()
  const wt = obj.workplaceType
  if (typeof wt === "string" && WORKPLACE_TYPES.has(wt.trim())) candidate.workplaceType = wt.trim()

  // The existing sieve still runs (trim, sentinel strings like "N/A" dropped).
  const fields = normalizeExtractedFields(candidate)

  let description: string | undefined
  const range = obj.descriptionRange
  if (range && typeof range === "object" && !Array.isArray(range)) {
    description =
      renderDescription(blocks, range as { start: number; end: number; exclude?: number[] }) ??
      undefined
  }

  return {
    fields,
    description,
    detected: {
      hasJobDetails: obj.hasJobDetails === true,
      hasApplicationForm: obj.hasApplicationForm === true,
    },
  }
}
