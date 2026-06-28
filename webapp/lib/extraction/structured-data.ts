/**
 * Deterministic structured-data mappers for the tiered extractor — pure, no I/O, no embeddings.
 *
 * This is tier 1 of job-details extraction: parse the page's own machine-readable metadata into our
 * ExtractedJob shape with PERFECT fidelity and zero cost. The dominant source is JSON-LD
 * `schema.org/JobPosting` (Google requires it for Job rich results, so coverage on real ATS pages is
 * high); OpenGraph/meta tags are a thin fallback for title/company/description.
 *
 * Everything is defensive: a malformed JSON-LD blob is skipped (never thrown), missing keys simply
 * don't appear, and free-text enum values that don't map are dropped rather than guessed. The merged
 * result is run through the existing normalizeExtractedFields() sieve (in details-tiered.ts) so it
 * obeys the exact same empty/sentinel rules as the LLM path.
 *
 * Reference: https://schema.org/JobPosting
 */

import { EXTRACTION_FIELDS, type ExtractedJob } from "@/lib/llm/extraction"
import { EMPLOYMENT_ENUM } from "@/lib/extraction/prototypes"

/** A page's machine-readable signals, harvested by the extension before the DOM is cleaned. */
export type KeyValueSegment = { key: string; value: string }
export type StructuredSignals = {
  /** Raw bodies of `<script type="application/ld+json">` blocks. */
  jsonLd: string[]
  /** OG/twitter/name meta tags as a flat map (e.g. { "og:title": "...", description: "..." }). */
  meta: Record<string, string>
  /** Generic key→value pairs from dl/dt-dd, table rows, microdata, and label/value clusters. */
  segments: KeyValueSegment[]
  /** The page's first <h1>, a strong title candidate. */
  h1?: string
  /** document.title — a weaker title candidate ("Role - Company | Site"). */
  titleHint?: string
  /** The cleaned page markdown (kept for parity/fallback; the LLM path consumes this). */
  mainText?: string
}

type JsonObject = Record<string, unknown>

/* ------------------------------------------------------------------------------------------------ */
/* JSON-LD                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Parse every `<script type=ld+json>` body into the JobPosting nodes it contains. Handles the real
 * shapes seen in the wild: a bare object, an array of objects, and `@graph` containers — at any nesting.
 * Bad JSON in one blob never breaks the others.
 */
export function parseJsonLdJobPostings(raw: string[]): JsonObject[] {
  const out: JsonObject[] = []
  for (const blob of raw) {
    let parsed: unknown
    try {
      parsed = JSON.parse(blob)
    } catch {
      continue // one malformed blob must not sink the rest
    }
    for (const node of flattenNodes(parsed)) {
      if (isType(node, "JobPosting")) out.push(node)
    }
  }
  return out
}

/** Walk an arbitrary JSON-LD value into its object nodes, following arrays and `@graph`. */
function flattenNodes(value: unknown, depth = 0): JsonObject[] {
  if (depth > 6 || value == null) return []
  if (Array.isArray(value)) return value.flatMap((v) => flattenNodes(v, depth + 1))
  if (typeof value !== "object") return []
  const obj = value as JsonObject
  // A `@graph` object is a container, not a content node — descend into its children and do NOT test
  // the wrapper itself (a wrapper that happened to carry a JobPosting @type would otherwise compete
  // with, and could clobber, the real inner node during merge).
  if (Array.isArray(obj["@graph"])) {
    return (obj["@graph"] as unknown[]).flatMap((v) => flattenNodes(v, depth + 1))
  }
  return [obj]
}

/** True if a node's `@type` is (or includes) `type` — `@type` may be a string or an array. */
function isType(node: JsonObject, type: string): boolean {
  const t = node["@type"]
  if (typeof t === "string") return t === type || t.endsWith(`/${type}`)
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && (x === type || x.endsWith(`/${type}`)))
  return false
}

/** Map ONE JobPosting node to our fields. Returns only keys it could fill; no normalization yet. */
export function mapJobPostingToFields(ld: JsonObject): ExtractedJob {
  const out: ExtractedJob = {}

  const title = asText(ld.title) || asText(ld.name)
  if (title) out.title = title

  const company = orgName(ld.hiringOrganization)
  if (company) out.company = company

  const location = composeLocation(ld)
  if (location) out.location = location

  const salary = composeSalary(ld.baseSalary)
  if (salary) out.salary = salary

  const employmentType = mapEmploymentEnum(ld.employmentType)
  if (employmentType) out.employmentType = employmentType

  const workplaceType = workplaceFromJobPosting(ld)
  if (workplaceType) out.workplaceType = workplaceType

  const description = stripHtml(asText(ld.description))
  if (description) out.description = description

  return out
}

function orgName(org: unknown): string {
  if (typeof org === "string") return org.trim()
  if (org && typeof org === "object") return asText((org as JsonObject).name)
  return ""
}

/** Compose "City, Region, Country" from jobLocation.address (PostalAddress), or a plain string. */
function composeLocation(ld: JsonObject): string {
  const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v)
  const loc = first(ld.jobLocation)
  if (typeof loc === "string") return loc.trim()
  if (loc && typeof loc === "object") {
    const node = loc as JsonObject
    const addr = node.address
    if (typeof addr === "string") return addr.trim()
    if (addr && typeof addr === "object") {
      const a = addr as JsonObject
      const parts = [a.addressLocality, a.addressRegion, a.addressCountry]
        .map(asText)
        .filter(Boolean)
      if (parts.length) return parts.join(", ")
    }
    const name = asText(node.name)
    if (name) return name
  }
  return ""
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  GBP: "£",
  EUR: "€",
  INR: "₹",
  JPY: "¥",
  CNY: "¥",
  CHF: "CHF ",
  SGD: "S$",
}
const PERIOD_SUFFIX: Record<string, string> = {
  HOUR: "/hr",
  DAY: "/day",
  WEEK: "/wk",
  MONTH: "/mo",
  YEAR: "/yr",
}

/**
 * Compose a salary string from schema.org MonetaryAmount, WITHOUT converting or estimating — we only
 * format the numbers, currency, and period the page already stated. Returns "" when nothing usable.
 */
export function composeSalary(baseSalary: unknown): string {
  if (baseSalary == null) return ""
  if (typeof baseSalary === "string") return baseSalary.trim()
  if (typeof baseSalary === "number") return formatMoney(baseSalary, "", "")
  if (typeof baseSalary !== "object") return ""

  const node = baseSalary as JsonObject
  const currency = asText(node.currency) || asText(node.salaryCurrency)
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? (currency ? `${currency} ` : "")

  // baseSalary.value is usually a QuantitativeValue { value | minValue, maxValue, unitText }.
  const value = node.value
  let min = "",
    max = "",
    single = "",
    unit = ""
  if (value && typeof value === "object") {
    const q = value as JsonObject
    min = numText(q.minValue)
    max = numText(q.maxValue)
    single = numText(q.value)
    unit = asText(q.unitText).toUpperCase()
  } else {
    single = numText(value)
    unit = asText(node.unitText).toUpperCase()
  }

  const period = PERIOD_SUFFIX[unit] ?? ""
  if (min && max && min !== max) return `${sym}${min} - ${sym}${max}${period}`
  const one = single || min || max
  if (one) return `${sym}${one}${period}`
  return ""
}

function formatMoney(n: number, sym: string, period: string): string {
  return `${sym}${n.toLocaleString("en-US")}${period}`
}

/** A schema number that may arrive as a number or numeric string; formats with thousands separators. */
function numText(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return v.toLocaleString("en-US")
  if (typeof v === "string") {
    const n = Number(v.replace(/[, ]/g, ""))
    if (Number.isFinite(n) && v.trim() !== "") return n.toLocaleString("en-US")
  }
  return ""
}

/**
 * Map schema.org employmentType (FULL_TIME, PART_TIME, CONTRACTOR, …) OR a free-text value to our enum.
 * Deterministic dictionary first (schema's controlled vocab is exact); unknown → "" (the embeddings
 * tier snaps free text). Accepts a string or an array (takes the first that maps).
 */
export function mapEmploymentEnum(raw: unknown): string {
  const candidates = Array.isArray(raw) ? raw : [raw]
  for (const c of candidates) {
    const norm = asText(c).toUpperCase().replace(/[^A-Z]/g, "")
    if (!norm) continue
    const hit = EMPLOYMENT_DICT[norm]
    if (hit) return hit
  }
  return ""
}

// Keyed by uppercased, letters-only form so "Full-time", "FULL_TIME", "full time" all collapse together.
const EMPLOYMENT_DICT: Record<string, (typeof EMPLOYMENT_ENUM)[number]> = {
  FULLTIME: "Full-time",
  PARTTIME: "Part-time",
  CONTRACT: "Contract",
  CONTRACTOR: "Contract",
  TEMPORARY: "Temporary",
  TEMP: "Temporary",
  INTERN: "Internship",
  INTERNSHIP: "Internship",
  FREELANCE: "Freelance",
  VOLUNTEER: "Volunteer",
  APPRENTICESHIP: "Apprenticeship",
  APPRENTICE: "Apprenticeship",
}

/** Map a free-text/structured workplace value to our enum (used by the meta/segment paths). */
export function mapWorkplaceEnum(raw: unknown): string {
  const norm = asText(raw).toUpperCase().replace(/[^A-Z]/g, "")
  if (!norm) return ""
  if (norm.includes("TELECOMMUTE") || norm === "REMOTE" || norm.includes("FULLYREMOTE")) return "Remote"
  if (norm.includes("HYBRID")) return "Hybrid"
  if (norm.includes("ONSITE") || norm.includes("INOFFICE") || norm.includes("INPERSON")) return "On-site"
  return ""
}

/**
 * Remote/Hybrid/On-site from a JobPosting: the ONLY authoritative schema.org signal is
 * `jobLocationType: "TELECOMMUTE"` → Remote. We deliberately do NOT infer from
 * `applicantLocationRequirements` — that restricts WHERE applicants may be based (an eligibility
 * filter), not whether the role is remote; treating it as "Remote" inverts its meaning. When this
 * returns "", tier 2 (segment embeddings) may still recover workplaceType.
 */
function workplaceFromJobPosting(ld: JsonObject): string {
  return mapWorkplaceEnum(ld.jobLocationType)
}

/* ------------------------------------------------------------------------------------------------ */
/* Meta / OpenGraph                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Lowest-fidelity fallback: title/description from OG/twitter/name meta tags.
 *
 * Deliberately does NOT map company: the only company-ish meta tag is `og:site_name`, which on real
 * ATS pages is the PLATFORM name (Lever, Greenhouse, Workday), not the hiring employer — mapping it
 * would save the wrong company. We leave company to JSON-LD; absent → the modal's blank-company
 * warning fires, which is honest.
 */
export function mapMetaTags(meta: Record<string, string>): ExtractedJob {
  const out: ExtractedJob = {}
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = meta[k]
      if (typeof v === "string" && v.trim()) return v.trim()
    }
    return ""
  }
  const title = get("og:title", "twitter:title")
  if (title) out.title = title
  const description = stripHtml(get("og:description", "twitter:description", "description"))
  if (description) out.description = description
  return out
}

/* ------------------------------------------------------------------------------------------------ */
/* Helpers                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/** Coerce a JSON-LD scalar to trimmed text (numbers included). Non-scalars → "". */
function asText(v: unknown): string {
  if (typeof v === "string") return v.trim()
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return ""
}

/** Strip HTML tags and decode the few common entities — JSON-LD/OG descriptions are often HTML. */
export function stripHtml(s: string): string {
  if (!s) return ""
  return s
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Merge layered ExtractedJob results — EARLIER layers win (highest fidelity first). Used by the
 * orchestrator to combine JSON-LD → meta → DOM heuristics without later, weaker sources clobbering
 * a strong one.
 */
export function mergeExtracted(...layers: ExtractedJob[]): ExtractedJob {
  const out: ExtractedJob = {}
  for (const key of EXTRACTION_FIELDS) {
    for (const layer of layers) {
      const v = layer[key]
      if (typeof v === "string" && v.trim()) {
        out[key] = v
        break
      }
    }
  }
  return out
}
