import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { env } from "@/lib/env"
import { embed } from "@/lib/llm/embeddings"
import { extractDetailsTiered } from "@/lib/extraction/details-tiered"
import { getPrototypeVectors } from "@/lib/extraction/prototype-embeddings"
import type { ExtractionResult } from "@/lib/server/extractions"
import type { TieredExtractInput } from "@/lib/validations/extract-tiered"

/**
 * Tiered job-details extraction service — the structured-data + embeddings alternative to
 * extractions.ts (the Groq path). Same ExtractionResult shape so it's drop-in behind /api/extract/tiered.
 *
 * No generation LLM is ever called: a page with JSON-LD/microdata is parsed for free (zero network);
 * only the leftover attribute fields trigger a cheap embeddings match. We log to the SAME ExtractionLog
 * as the LLM path — with `model: "tiered:<tiers>"` and zero generation tokens — so cost and coverage are
 * directly comparable when A/B-ing the two paths.
 */

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

export async function extractJobTiered(
  userId: string,
  input: TieredExtractInput,
): Promise<ExtractionResult> {
  const contextChars = signalChars(input)
  const startedAt = Date.now()

  let coverage
  try {
    coverage = await extractDetailsTiered(input.signals, {
      embed,
      getPrototypes: getPrototypeVectors,
      enumMinScore: env.TIERED_ENUM_MIN_SCORE,
    })
  } catch (err) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: "tiered:error",
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: false,
    })
    if (err instanceof ApiError) throw err
    throw new ApiError("INTERNAL", `Tiered extraction failed: ${String(err)}`)
  }

  await logExtraction({
    userId,
    source: input.source,
    url: input.url,
    model: `tiered:${coverage.tiers.join("+") || "none"}`,
    ...ZERO_USAGE,
    contextChars,
    durationMs: Date.now() - startedAt,
    success: true,
  })

  return { fields: coverage.fields, description: coverage.description, usage: ZERO_USAGE }
}

/** Rough input size for the log (parity with the LLM path's contextChars): the signals we received. */
function signalChars(input: TieredExtractInput): number {
  const s = input.signals
  const seg = s.segments.reduce((n, p) => n + p.key.length + p.value.length, 0)
  const meta = Object.values(s.meta).reduce((n, v) => n + v.length, 0)
  const ld = s.jsonLd.reduce((n, b) => n + b.length, 0)
  return seg + meta + ld + (s.h1?.length ?? 0) + (s.titleHint?.length ?? 0)
}

type LogInput = {
  userId: string
  source?: string
  url?: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextChars: number
  durationMs: number
  success: boolean
}

async function logExtraction(input: LogInput) {
  // Never let a logging failure break the user's extraction — log it and move on.
  try {
    await prisma.extractionLog.create({
      data: {
        user: { connect: { id: input.userId } },
        source: input.source,
        url: input.url,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        contextChars: input.contextChars,
        durationMs: input.durationMs,
        success: input.success,
      },
    })
  } catch (err) {
    console.error("[extractions-tiered] failed to write ExtractionLog:", err)
  }
}
