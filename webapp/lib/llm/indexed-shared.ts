/**
 * Indexed extraction — shared, pure primitives (no I/O).
 *
 * The extension captures the page as ordered, typed BLOCKS (see extension/parsers/
 * block-capture.js) plus the harvested form fields. This module renders those blocks as the
 * numbered document both tasks share ("B12| …"), so the model can answer with block indices
 * and field ids instead of regenerating content. The rendered prefix must stay BYTE-IDENTICAL
 * between the details and questions prompts — it is the prompt-cache key.
 */

import type { LlmMessage } from "@/lib/llm/openrouter"

export type CapturedBlock = {
  i: number
  kind: "heading" | "para" | "li" | "row" | "field"
  text: string
}

export type HarvestedField = {
  id: string
  label: string
  kind: string
  inputType?: string
  options?: string[]
  required?: boolean
  placeholder?: string
}

/** Shared system prompt — the cached prefix's first component. Keep identical across tasks. */
export const INDEXED_SYSTEM =
  "You read one job posting web page, given as numbered blocks (B<n>| text) converted from the " +
  "rendered page: headings, paragraphs, list items, table rows, and form controls encoded as " +
  "[field q<n>: …] markers. The page may include site navigation and boilerplate. You answer " +
  "by POINTING at the page — block index ranges and field ids — plus short verbatim values. " +
  "Use only what the input actually states: never guess, infer, or invent. For anything " +
  "genuinely not present, use null. Output JSON only, no prose."

export function renderBlockDoc(blocks: CapturedBlock[]): string {
  return blocks.map((b) => `B${b.i}| ${b.text}`).join("\n")
}

/** The byte-identical cached prefix: system + the block doc. Both marked cacheable. */
export function pagePrefixMessages(blocks: CapturedBlock[]): LlmMessage[] {
  return [
    { role: "system", content: INDEXED_SYSTEM, cache: true },
    {
      role: "user",
      content: 'Job posting page as numbered blocks:\n"""\n' + renderBlockDoc(blocks) + '\n"""',
      cache: true,
    },
  ]
}

/** Rough input-token estimate (chars/4) including the B<n>| numbering overhead. */
export function estimateTokens(blocks: CapturedBlock[]): number {
  const chars = blocks.reduce((n, b) => n + b.text.length + 6, 0)
  return Math.ceil(chars / 4)
}

// ---- outline pre-pass (oversized pages only) -------------------------------------------------

const OUTLINE_SNIPPET = 80

/** Compressed skeleton: headings + field blocks whole; other blocks truncated to 80 chars. */
export function renderOutline(blocks: CapturedBlock[]): string {
  return blocks
    .map((b) => {
      const text =
        b.kind === "heading" || b.kind === "field"
          ? b.text
          : b.text.length > OUTLINE_SNIPPET
            ? b.text.slice(0, OUTLINE_SNIPPET) + "…"
            : b.text
      return `B${b.i}| ${text}`
    })
    .join("\n")
}

export function buildOutlineMessages(
  blocks: CapturedBlock[],
  task: "details" | "questions",
): LlmMessage[] {
  const goal =
    task === "details"
      ? "the job posting's details: title, company, location, salary, employment/workplace type, and the FULL job description body"
      : "the application form a candidate must fill in (all its fields and their surrounding labels/help text)"
  return [
    { role: "system", content: INDEXED_SYSTEM },
    {
      role: "user",
      content:
        'Outline of a job posting page (blocks truncated):\n"""\n' +
        renderOutline(blocks) +
        '\n"""\n\nIdentify every region of this page that contains ' +
        goal +
        '. Respond with JSON only: {"regions":[{"start":<first block index>,"end":<last block index>}]} ' +
        "— generous ranges are fine; missing content is worse than extra.",
    },
  ]
}

/** Validate the outline reply. Returns clamped regions, or null when unusable. */
export function parseOutlineRegions(
  raw: unknown,
  blockCount: number,
): Array<{ start: number; end: number }> | null {
  const obj = asObject(raw)
  if (!obj || !Array.isArray(obj.regions) || obj.regions.length === 0) return null
  const out: Array<{ start: number; end: number }> = []
  for (const r of obj.regions) {
    if (!r || typeof r !== "object") return null
    const start = Math.max(0, Math.trunc(Number((r as Record<string, unknown>).start)))
    const end = Math.min(blockCount - 1, Math.trunc(Number((r as Record<string, unknown>).end)))
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
    out.push({ start, end })
  }
  return out
}

const ALWAYS_KEEP_FIRST = 40

/** Keep regions ∪ the first 40 blocks ∪ every field block — original order, no dupes. */
export function sliceRegions(
  blocks: CapturedBlock[],
  regions: Array<{ start: number; end: number }>,
): CapturedBlock[] {
  const keep = new Set<number>()
  for (let i = 0; i < Math.min(ALWAYS_KEEP_FIRST, blocks.length); i++) keep.add(blocks[i].i)
  for (const b of blocks) if (b.kind === "field") keep.add(b.i)
  for (const r of regions) for (let i = r.start; i <= r.end; i++) keep.add(i)
  return blocks.filter((b) => keep.has(b.i))
}

/** Tolerant JSON-object reader (same behaviour as extraction.ts's private helper). */
export function asObject(raw: unknown): Record<string, unknown> | null {
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
