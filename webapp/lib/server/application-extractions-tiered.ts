import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { env } from "@/lib/env"
import { embed } from "@/lib/llm/embeddings"
import { extractQuestionsTiered } from "@/lib/extraction/questions-tiered"
import { getPrototypeVectors } from "@/lib/extraction/prototype-embeddings"
import type { ApplicationExtractionResult } from "@/lib/server/application-extractions"
import type { TieredApplicationExtractInput } from "@/lib/validations/extract-tiered"

/**
 * Tiered application-question extraction service — the DOM-harvest + embeddings-gate alternative to
 * application-extractions.ts (the Groq path). Same ApplicationExtractionResult shape so it's drop-in
 * behind /api/extract-application/tiered.
 *
 * The extension already read the form structurally (types/options/required), so there is no LLM call;
 * the only cost is one embeddings batch for the inclusion gate (skipped entirely for an empty form).
 * Logged to the shared ExtractionLog with `model: "tiered:questions"` and zero generation tokens.
 */

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

export async function extractApplicationTiered(
  userId: string,
  input: TieredApplicationExtractInput,
): Promise<ApplicationExtractionResult> {
  const contextChars = input.fields.reduce((n, f) => n + f.label.length, 0)
  const startedAt = Date.now()

  let coverage
  try {
    coverage = await extractQuestionsTiered(input.fields, {
      embed,
      getPrototypes: getPrototypeVectors,
      keepFloor: env.TIERED_QUESTION_KEEP_FLOOR,
      noiseMargin: env.TIERED_NOISE_MARGIN,
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
    throw new ApiError("INTERNAL", `Tiered application extraction failed: ${String(err)}`)
  }

  await logExtraction({
    userId,
    source: input.source,
    url: input.url,
    model: "tiered:questions",
    ...ZERO_USAGE,
    contextChars,
    durationMs: Date.now() - startedAt,
    success: true,
  })

  return { questions: coverage.questions, usage: ZERO_USAGE }
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
    console.error("[application-extractions-tiered] failed to write ExtractionLog:", err)
  }
}
