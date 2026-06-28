import type { ApplicationFieldType } from "@/lib/llm/application-extraction"

/**
 * How an application answer is encoded into the single `JobApplicationAnswer.value` text column.
 *
 * - Multi-value choice questions (`checkbox` / `multi_select` that actually offer options) store a
 *   JSON string array, e.g. `["Remote","Hybrid"]`.
 * - Everything else — text, the native scalars (number/url/email/tel/date), `select`, `radio`, and a
 *   bare consent `checkbox` (no options) — stores its value as a plain string.
 *
 * The question's `type` plus whether it has options is enough to read a value back. These helpers are
 * the single source of truth for the convention, shared by the answer form (encode on edit) and the
 * autofill backend (decode when reading saved answers to fill a page).
 *
 * Why JSON-in-text and not a child table: an answer is always read and written atomically per
 * question, and nothing queries individual selected options — so a normalized options table would add
 * joins and write complexity for no query benefit. JSON-in-text keeps the existing one-row-per-question
 * upsert and needs no migration.
 */

type ChoiceShape = { type: ApplicationFieldType; options?: string[] }

/**
 * True for the multi-select family: a `checkbox` or `multi_select` that offers options. A bare
 * `checkbox` with no options is a single consent toggle (stored as "true"/""), not a multi-value answer.
 */
export function isMultiValue(q: ChoiceShape): boolean {
  return (q.type === "checkbox" || q.type === "multi_select") && !!q.options?.length
}

/** Decode a stored multi-value answer into its selected option strings (tolerant of malformed data). */
export function decodeMultiValue(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string")
  } catch {
    // Legacy or hand-entered value: treat a non-JSON string as a single selection.
    return raw.trim() ? [raw] : []
  }
  return []
}

/** Encode selected options back to the stored string. An empty selection → "" (clears the answer). */
export function encodeMultiValue(values: string[]): string {
  return values.length ? JSON.stringify(values) : ""
}
