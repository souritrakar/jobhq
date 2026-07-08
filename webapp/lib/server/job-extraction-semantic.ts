/**
 * Semantic job-detail extraction: markdown → sections → bounded RAG context → one Groq call.
 *
 * The 413 came from sending a whole posting to Groq. This service instead parses the captured
 * markdown into semantic sections (lib/llm/markdown-sectioner), then assembles a TOKEN-BOUNDED
 * context for synthesis:
 *   1. Priors — always include the lead/header block and the first job-description block. For most
 *      postings the five detail fields (title, company, location, salary, summary) live here, so
 *      this alone is usually sufficient and costs almost nothing.
 *   2. Similarity top-up — embed ONE composite query describing the fields and fill the remaining
 *      token budget with the highest-cosine chunks. This is what makes it generalize: on a long or
 *      oddly-laid-out page where salary hides in a benefits table, retrieval still reaches it.
 *
 * The final context is capped well under Groq's limit, so there is no 413 and no information loss
 * (anything relevant is reachable via retrieval; nothing is truncated upstream). Embeddings reuse
 * the existing OpenRouter seam (lib/llm/embeddings).
 */

import { createHash } from "node:crypto"

import {
  parseMarkdownToSections,
  createRetrievalChunks,
  estimateTokens,
  type RetrievalChunk,
} from "@/lib/llm/markdown-sectioner"
import { embed } from "@/lib/llm/embeddings"
import { groqChat } from "@/lib/llm/groq"
import { env } from "@/lib/env"
import type { ChatMessage } from "@/lib/llm/extraction"

/** Token ceiling for the assembled context. Stays safely under Groq's observed ~3.5k 413 wall. */
const CONTEXT_TOKEN_BUDGET = 2400
/** Per-chunk size when slicing oversized sections. */
const MAX_CHUNK_TOKENS = 800

export interface SemanticExtractionResult {
  fields: {
    title?: string
    company?: string
    location?: string
    salary?: string
    description?: string
  }
  metadata: {
    totalSections: number
    totalChunks: number
    chunksUsed: number
    /** Index-wide token total (the full posting we parsed, pre-selection). */
    indexTokens: number
    /** Tokens actually assembled into the Groq context after bounded selection. */
    contextTokens: number
    /** Groq's reported usage for the single synthesis call. */
    inputTokensUsed: number
    outputTokensUsed: number
    /** Which chunks made the cut (role + size), for debugging in the panel/logs. */
    usedChunks: Array<{ id: string; role: string; tokens: number }>
    /** Whether the parsed index was served from cache (re-extract path). */
    cacheHit: boolean
  }
}

export interface ChunkIndex {
  chunks: RetrievalChunk[]
  totalSections: number
  indexTokens: number
  sourceUrl: string
}

// ---- index cache --------------------------------------------------------------------------------
// Parsing + embedding are deterministic in the input text, so a re-extract of the same page can
// reuse the work entirely. Small in-memory LRU keyed by a content hash. Process-local and bounded;
// it just spares the obvious waste of re-embedding identical content within a session.
const INDEX_CACHE = new Map<string, ChunkIndex>()
const INDEX_CACHE_MAX = 32

function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function cacheGet(key: string): ChunkIndex | undefined {
  const hit = INDEX_CACHE.get(key)
  if (hit) {
    // Refresh recency (Map preserves insertion order → delete+set moves to newest).
    INDEX_CACHE.delete(key)
    INDEX_CACHE.set(key, hit)
  }
  return hit
}

function cacheSet(key: string, value: ChunkIndex): void {
  INDEX_CACHE.set(key, value)
  while (INDEX_CACHE.size > INDEX_CACHE_MAX) {
    const oldest = INDEX_CACHE.keys().next().value
    if (oldest === undefined) break
    INDEX_CACHE.delete(oldest)
  }
}

/**
 * Parse + chunk + embed a posting's markdown into a retrievable index. Cached by content hash so a
 * re-extract of the same page is instant. Throws if parsing yields nothing usable.
 */
export async function buildChunkIndex(markdown: string, sourceUrl: string): Promise<{ index: ChunkIndex; cacheHit: boolean }> {
  const key = cacheKey(markdown)
  const cached = cacheGet(key)
  if (cached) {
    console.log(`[semantic] cache hit — ${cached.chunks.length} chunks, ${cached.indexTokens} tokens`)
    return { index: cached, cacheHit: true }
  }

  const sections = parseMarkdownToSections(markdown)
  if (!sections.length) {
    throw new Error("No sections parsed from the captured markdown")
  }

  const chunks = createRetrievalChunks(sections, { maxChunkTokens: MAX_CHUNK_TOKENS, overlapTokens: 60 })
  if (!chunks.length) {
    throw new Error("No chunks produced from parsed sections")
  }

  console.log(
    `[semantic] parsed ${sections.length} sections → ${chunks.length} chunks`,
    `(roles: ${[...new Set(chunks.map((c) => c.sectionRole))].join(", ")})`,
  )

  // One batched embedding call for every chunk.
  const embeddings = await embed(chunks.map((c) => c.text))
  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${chunks.length} chunks`)
  }
  chunks.forEach((c, i) => (c.embedding = embeddings[i]))

  const index: ChunkIndex = {
    chunks,
    totalSections: sections.length,
    indexTokens: chunks.reduce((sum, c) => sum + c.estimatedTokens, 0),
    sourceUrl,
  }
  cacheSet(key, index)
  return { index, cacheHit: false }
}

/** The composite retrieval query — one embedding describing everything we want to pull. */
const DETAIL_QUERY =
  "Job title, hiring company name, work location, salary or compensation range, " +
  "and a summary of the role and its responsibilities."

/**
 * Assemble a token-bounded context (priors + similarity top-up) and synthesize the five detail
 * fields in a single Groq call.
 */
export async function extractJobDetailsSemanticRAG(
  index: ChunkIndex,
  cacheHit: boolean,
): Promise<SemanticExtractionResult> {
  const selected = await selectContext(index)
  const contextText = selected
    .map((c) => {
      const crumb = c.headingPath.length ? c.headingPath.join(" ▸ ") : c.sectionRole
      return `## ${crumb}\n${c.text}`
    })
    .join("\n\n")
  const contextTokens = estimateTokens(contextText)

  console.log(
    `[semantic] context: ${selected.length}/${index.chunks.length} chunks, ${contextTokens} tokens →`,
    selected.map((c) => `${c.sectionRole}(${c.estimatedTokens}t)`).join(", "),
  )

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You extract structured facts from a job posting. Use ONLY the provided context. " +
        "Never invent or infer values that are not present. Reply with a single JSON object.",
    },
    { role: "user", content: buildPrompt(contextText) },
  ]

  const result = await groqChat(messages, {
    model: env.GROQ_MODEL,
    maxTokens: 700,
    json: true,
    reasoningEffort: "low",
  })

  const parsed = safeParseFields(result.content)

  return {
    fields: {
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
      salary: parsed.salary,
      description: parsed.description,
    },
    metadata: {
      totalSections: index.totalSections,
      totalChunks: index.chunks.length,
      chunksUsed: selected.length,
      indexTokens: index.indexTokens,
      contextTokens,
      inputTokensUsed: result.usage.inputTokens,
      outputTokensUsed: result.usage.outputTokens,
      usedChunks: selected.map((c) => ({ id: c.id, role: c.sectionRole, tokens: c.estimatedTokens })),
      cacheHit,
    },
  }
}

// ---- context selection --------------------------------------------------------------------------

/**
 * Pick chunks for the synthesis context, bounded by CONTEXT_TOKEN_BUDGET:
 *   1. Priors first — header chunks, then the earliest job_description chunk. High-value, cheap.
 *   2. Similarity top-up — remaining budget filled by cosine to the composite DETAIL_QUERY.
 * Final list is returned in reading order (by section position) for coherent context.
 */
async function selectContext(index: ChunkIndex): Promise<RetrievalChunk[]> {
  const budget = CONTEXT_TOKEN_BUDGET
  const picked = new Map<string, RetrievalChunk>()
  let used = 0

  const tryAdd = (c: RetrievalChunk): boolean => {
    if (picked.has(c.id)) return false
    if (used + c.estimatedTokens > budget && picked.size > 0) return false
    picked.set(c.id, c)
    used += c.estimatedTokens
    return true
  }

  // 1) Priors. The top of a posting reliably holds the title + company (the H1 title heading is
  //    unclassifiable by keyword, so we anchor on POSITION, not just role): take the first two
  //    chunks in reading order, then any header chunks, then the first job_description chunk.
  const byPosition = [...index.chunks].sort((a, b) => a.position - b.position)
  for (const c of byPosition.slice(0, 2)) tryAdd(c)
  for (const c of byPosition) if (c.sectionRole === "header") tryAdd(c)
  const firstDesc = byPosition.find((c) => c.sectionRole === "job_description")
  if (firstDesc) tryAdd(firstDesc)

  // 2) Similarity top-up against the composite query (best-effort; priors already give a floor).
  const remaining = index.chunks.filter((c) => !picked.has(c.id) && c.embedding)
  if (remaining.length && used < budget) {
    let queryVec: number[] | undefined
    try {
      ;[queryVec] = await embed([DETAIL_QUERY])
    } catch (err) {
      console.error("[semantic] query embed failed; using priors only", err)
    }
    if (queryVec) {
      const ranked = remaining
        .map((c) => ({ c, score: cosineSimilarity(queryVec!, c.embedding!) }))
        .sort((a, b) => b.score - a.score)
      for (const { c } of ranked) {
        if (used >= budget) break
        tryAdd(c)
      }
    }
  }

  // Fallback: if priors found nothing (no header/description headings), take earliest chunks.
  if (picked.size === 0) {
    for (const c of byPosition) if (!tryAdd(c)) break
  }

  return [...picked.values()].sort((a, b) => a.position - b.position)
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

// ---- prompt + parse -----------------------------------------------------------------------------

function buildPrompt(contextText: string): string {
  return (
    "From the job posting context below, extract these fields:\n" +
    "- title: the job title\n" +
    "- company: the hiring company's name\n" +
    "- location: where the job is based (city/region/remote)\n" +
    "- salary: the pay or compensation range, exactly as stated\n" +
    "- description: a concise 1–3 sentence summary of the role\n\n" +
    "Context:\n" +
    contextText +
    "\n\nReturn a JSON object with exactly these keys: title, company, location, salary, description. " +
    "Use null for any field not present in the context. Do not use em dashes."
  )
}

type DetailFields = {
  title?: string
  company?: string
  location?: string
  salary?: string
  description?: string
}

/** Parse Groq's JSON reply defensively: tolerate prose/fences, drop empty/placeholder values. */
function safeParseFields(content: string): DetailFields {
  const obj = asObject(content)
  if (!obj) return {}
  const out: DetailFields = {}
  for (const key of ["title", "company", "location", "salary", "description"] as const) {
    const v = obj[key]
    if (typeof v !== "string") continue
    const trimmed = v.trim()
    if (!trimmed || /^(null|n\/a|none|unknown|not specified|not stated)$/i.test(trimmed)) continue
    out[key] = trimmed
  }
  return out
}

function asObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      const parsed = JSON.parse(m[0])
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}
