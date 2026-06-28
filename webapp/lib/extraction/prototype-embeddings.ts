/**
 * Embed the static prototype label sets ONCE, then reuse the vectors across every request.
 *
 * The prototypes (lib/extraction/prototypes.ts) never change at runtime, so embedding them per request
 * would be pure waste. `getPrototypeVectors()` memoizes a single in-flight Promise for the process; the
 * first tier-2/gate call that needs them pays one batched embed() round-trip, everyone after reuses it.
 * Because nothing is committed to disk, swapping EMBEDDINGS_MODEL just re-embeds on the next cold start
 * — the seam stays provider-agnostic (see lib/llm/embeddings.ts).
 *
 * `buildPrototypeVectors(embedFn)` is the un-memoized core, used by tests with a stub embedder so the
 * prototype vectors and the runtime vectors live in the SAME space (consistent cosine), no network.
 *
 * There is NO vector DB here on purpose: this is tens of vectors matched in-memory, exactly like the
 * autofill matcher already does. Qdrant/pgvector would be over-engineering at this scale.
 */

import { embed } from "@/lib/llm/embeddings"
import {
  FIELD_PROTOTYPES,
  EMPLOYMENT_ENUM,
  NOISE_PROTOTYPES,
  QUESTION_PROTOTYPES,
  WORKPLACE_ENUM,
  type AttributeField,
} from "@/lib/extraction/prototypes"

/** The single embeddings seam, narrowed to what this module needs. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>

export type PrototypeVectors = {
  /** Per attribute field: one vector per synonym in FIELD_PROTOTYPES[field]. */
  field: Record<AttributeField, number[][]>
  /** One vector per EMPLOYMENT_ENUM value (parallel array, same order). */
  employmentEnum: number[][]
  /** One vector per WORKPLACE_ENUM value (parallel array, same order). */
  workplaceEnum: number[][]
  /** One vector per QUESTION_PROTOTYPES label. */
  question: number[][]
  /** One vector per NOISE_PROTOTYPES label. */
  noise: number[][]
}

const FIELD_KEYS = Object.keys(FIELD_PROTOTYPES) as AttributeField[]

/**
 * Embed all prototype sets in ONE batched call and slice the result back into its groups. Order is
 * fixed (field synonyms, then enums, then question, then noise) so a single embed() covers everything.
 */
export async function buildPrototypeVectors(embedFn: EmbedFn = embed): Promise<PrototypeVectors> {
  // Assemble one flat list with known segment lengths, then carve the vectors back out in order.
  const fieldTexts = FIELD_KEYS.map((k) => FIELD_PROTOTYPES[k])
  const segments: string[][] = [
    ...fieldTexts,
    [...EMPLOYMENT_ENUM],
    [...WORKPLACE_ENUM],
    QUESTION_PROTOTYPES,
    NOISE_PROTOTYPES,
  ]
  const flat = segments.flat()
  const vectors = await embedFn(flat)

  let cursor = 0
  const take = (n: number): number[][] => vectors.slice(cursor, (cursor += n))

  const field = {} as Record<AttributeField, number[][]>
  for (let i = 0; i < FIELD_KEYS.length; i++) field[FIELD_KEYS[i]] = take(fieldTexts[i].length)
  const employmentEnum = take(EMPLOYMENT_ENUM.length)
  const workplaceEnum = take(WORKPLACE_ENUM.length)
  const question = take(QUESTION_PROTOTYPES.length)
  const noise = take(NOISE_PROTOTYPES.length)

  return { field, employmentEnum, workplaceEnum, question, noise }
}

let cache: Promise<PrototypeVectors> | null = null

/**
 * Process-memoized prototype vectors (real embedder). Lazily built on first use; reused thereafter.
 * Relies on single-threaded execution: concurrent callers in the same tick share the one in-flight
 * Promise, and the `cache = null` on failure runs in the rejection microtask before any later call
 * reads `cache` — so a transient embed failure retries on the NEXT request rather than being cached.
 */
export function getPrototypeVectors(): Promise<PrototypeVectors> {
  if (!cache) {
    cache = buildPrototypeVectors(embed).catch((err) => {
      cache = null
      throw err
    })
  }
  return cache
}
