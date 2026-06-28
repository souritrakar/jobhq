/**
 * Tiered (non-LLM) job-details extractor. Pure — the embedder and prototype-vector source are injected,
 * so it unit-tests with a stub and no network. An alternative to lib/server/extractions.ts (the Groq
 * path), returning the EXACT same ExtractedJob shape so it's drop-in behind the /tiered route.
 *
 *   Tier 1 — structured data (deterministic, free, highest fidelity): JSON-LD JobPosting → meta tags →
 *            DOM heuristics (h1/titleHint) for title/company/description.
 *   Tier 2 — embeddings (only for attribute fields tier 1 missed): map the page's {key,value} segments
 *            to salary/location/employmentType/workplaceType by embedding the KEY and matching it to the
 *            field prototypes; snap free-text enum values to the controlled vocab. Greedy one-to-one,
 *            reusing the autofill MIN_SCORE floor.
 *
 * Tier 2 runs ONLY when needed: a page whose JSON-LD already fills every field makes ZERO embed calls
 * (the prototype source is a lazy thunk). The merged result passes through normalizeExtractedFields()
 * so empties/sentinels are dropped identically to the LLM path. No LLM is ever called (pure non-LLM).
 */

import { cosine, MIN_SCORE } from "@/lib/application/field-matching"
import {
  normalizeExtractedFields,
  type ExtractedJob,
} from "@/lib/llm/extraction"
import { EMPLOYMENT_ENUM, WORKPLACE_ENUM, type AttributeField } from "@/lib/extraction/prototypes"
import type { EmbedFn, PrototypeVectors } from "@/lib/extraction/prototype-embeddings"
import {
  mapEmploymentEnum,
  mapMetaTags,
  mapJobPostingToFields,
  mapWorkplaceEnum,
  mergeExtracted,
  parseJsonLdJobPostings,
  type StructuredSignals,
} from "@/lib/extraction/structured-data"

const ATTRIBUTE_FIELDS: AttributeField[] = ["salary", "location", "employmentType", "workplaceType"]
const DEFAULT_ENUM_MIN_SCORE = 0.55 // stricter than MIN_SCORE — a wrong enum is a visible error

export type DetailsCoverage = {
  /** The structured fields, minus description (split out to mirror the LLM service's return). */
  fields: ExtractedJob
  /** The cleaned description, when a structured source provided one. */
  description?: string
  /** Which tiers contributed, for logging/telemetry (e.g. ["jsonld", "embeddings"]). */
  tiers: string[]
  /** 0..1 — required fields present (title+company) weighted with optional-field coverage. */
  confidence: number
}

export type DetailsDeps = {
  embed: EmbedFn
  /** Lazy so a fully-structured page never triggers the prototype embed. */
  getPrototypes: () => Promise<PrototypeVectors>
  /** Cosine floor for the segment-key → field match (defaults to the shared autofill MIN_SCORE). */
  fieldMinScore?: number
  /** Cosine floor for snapping a free-text enum value to the controlled vocab. */
  enumMinScore?: number
}

/** Extract job details from a page's structured signals using tier 1, then tier 2 for any gaps. */
export async function extractDetailsTiered(
  signals: StructuredSignals,
  deps: DetailsDeps,
): Promise<DetailsCoverage> {
  const fieldMinScore = deps.fieldMinScore ?? MIN_SCORE
  const enumMinScore = deps.enumMinScore ?? DEFAULT_ENUM_MIN_SCORE
  const tiers: string[] = []

  // --- Tier 1: structured data ------------------------------------------------------------------
  const postings = parseJsonLdJobPostings(signals.jsonLd)
  // Log the tier on PRESENCE of a parsed JobPosting (not on whether it filled a field), so the A/B
  // telemetry can tell "JSON-LD present but sparse" apart from "no JSON-LD at all".
  if (postings.length) tiers.push("jsonld")
  const ldFields = postings.length ? mergeExtracted(...postings.map(mapJobPostingToFields)) : {}

  const metaFields = mapMetaTags(signals.meta)
  if (!tiers.includes("jsonld") && Object.keys(metaFields).length) tiers.push("meta")

  const domFields: ExtractedJob = {}
  if (signals.h1?.trim()) domFields.title = signals.h1.trim()
  else if (signals.titleHint?.trim()) domFields.title = cleanTitleHint(signals.titleHint)

  // Highest-fidelity-first merge. DOM heuristics only supply title (company/description stay honest:
  // absent → the modal's blank-field warning fires, exactly as when the LLM returns nothing).
  let merged = mergeExtracted(ldFields, metaFields, domFields)

  // --- Tier 2: embeddings for attribute fields tier 1 didn't fill --------------------------------
  const missing = ATTRIBUTE_FIELDS.filter((f) => !merged[f])
  if (missing.length && signals.segments.length) {
    const protos = await deps.getPrototypes()
    const tier2 = await matchSegmentsToFields(
      signals.segments,
      missing,
      protos,
      deps.embed,
      fieldMinScore,
      enumMinScore,
    )
    if (Object.keys(tier2).length) {
      tiers.push("embeddings")
      merged = mergeExtracted(merged, tier2) // merged wins; tier2 only fills the gaps
    }
  }

  // --- Normalize identically to the LLM path, then split description out -------------------------
  const normalized = normalizeExtractedFields(merged)
  const { description, ...fields } = normalized
  return { fields, description, tiers, confidence: scoreCoverage(normalized) }
}

/**
 * Tier 2 matcher: embed the segment KEYS, score each against the (still-missing) field prototypes, and
 * greedily assign one segment per field above the floor. Enum fields get their value snapped to the
 * controlled vocab; salary/location take the value as-is.
 */
async function matchSegmentsToFields(
  segments: { key: string; value: string }[],
  missing: AttributeField[],
  protos: PrototypeVectors,
  embed: EmbedFn,
  fieldMinScore: number,
  enumMinScore: number,
): Promise<ExtractedJob> {
  const keys = segments.map((s) => cleanKey(s.key))
  // Embed segment keys + any enum-candidate values together; the enum snap reuses the same call.
  const enumValues = missing.includes("employmentType") || missing.includes("workplaceType")
    ? segments.map((s) => s.value.slice(0, 120))
    : []
  const all = await embed([...keys, ...enumValues])
  const keyVecs = all.slice(0, keys.length)
  const valueVecs = enumValues.length ? all.slice(keys.length) : []

  // Score every (field, segment) pair: a field's score is the max cosine over its prototype synonyms.
  const pairs: Array<{ field: AttributeField; si: number; score: number }> = []
  for (const field of missing) {
    const fieldVecs = protos.field[field]
    for (let si = 0; si < segments.length; si++) {
      let best = 0
      for (const pv of fieldVecs) {
        const c = cosine(keyVecs[si], pv)
        if (c > best) best = c
      }
      pairs.push({ field, si, score: best })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const out: ExtractedJob = {}
  const usedField = new Set<AttributeField>()
  const usedSeg = new Set<number>()
  for (const { field, si, score } of pairs) {
    if (score < fieldMinScore) break // sorted desc — nothing else clears the floor
    if (usedField.has(field) || usedSeg.has(si)) continue
    const rawValue = segments[si].value.trim()
    if (!rawValue) continue
    const value = resolveFieldValue(field, rawValue, valueVecs[si], protos, enumMinScore)
    if (!value) continue // enum that wouldn't snap — drop rather than guess
    out[field] = value
    usedField.add(field)
    usedSeg.add(si)
  }
  return out
}

/** Salary/location pass through; enum fields snap to the controlled vocab (dict, then nearest vector). */
function resolveFieldValue(
  field: AttributeField,
  rawValue: string,
  valueVec: number[] | undefined,
  protos: PrototypeVectors,
  enumMinScore: number,
): string {
  if (field === "salary" || field === "location") return rawValue
  if (field === "employmentType") {
    return mapEmploymentEnum(rawValue) || snapEnum(valueVec, protos.employmentEnum, EMPLOYMENT_ENUM, enumMinScore)
  }
  // workplaceType
  return mapWorkplaceEnum(rawValue) || snapEnum(valueVec, protos.workplaceEnum, WORKPLACE_ENUM, enumMinScore)
}

/** Nearest controlled-vocab value to a free-text value's vector, or "" if none clears the floor. */
function snapEnum(
  valueVec: number[] | undefined,
  enumVecs: number[][],
  vocab: readonly string[],
  minScore: number,
): string {
  if (!valueVec) return ""
  let bestI = -1
  let best = 0
  for (let i = 0; i < enumVecs.length; i++) {
    const c = cosine(valueVec, enumVecs[i])
    if (c > best) {
      best = c
      bestI = i
    }
  }
  return best >= minScore && bestI >= 0 ? vocab[bestI] : ""
}

/** document.title is often "Role - Company | Site"; keep the leading segment as a title candidate. */
function cleanTitleHint(s: string): string {
  return s.split(/\s+[|–—-]\s+/)[0].trim() || s.trim()
}

function cleanKey(s: string): string {
  return s.replace(/\s+/g, " ").replace(/[:*]+\s*$/, "").trim().slice(0, 120)
}

/** Telemetry-only coverage score: required (title+company) at half, optional fill rate at half. */
function scoreCoverage(fields: ExtractedJob): number {
  const required = fields.title && fields.company ? 1 : fields.title || fields.company ? 0.5 : 0
  const optional = ["location", "salary", "employmentType", "workplaceType", "description"]
  const filled = optional.filter((k) => fields[k as keyof ExtractedJob]).length
  return 0.5 * required + 0.5 * (filled / optional.length)
}
