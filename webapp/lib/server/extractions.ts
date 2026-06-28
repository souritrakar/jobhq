import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { env } from "@/lib/env"
import { groqChat } from "@/lib/llm/groq"
import {
  buildExtractionMessages,
  normalizeExtractedFields,
  type ExtractedJob,
} from "@/lib/llm/extraction"
import type { ExtractInput } from "@/lib/validations/extract"

/**
 * Extraction service — one Groq call per request.
 *
 * The extension sends the posting's readable page text; we run a single model call that
 * returns every structured field plus the cleaned description as JSON, normalize it, and
 * log the token usage. No per-site scoping, no second model, no deterministic passes —
 * the simplest thing that gets the job done. All DB access is userId-scoped.
 */

export type ExtractionResult = {
  fields: ExtractedJob
  // The cleaned description, when the model returned one. Omitted otherwise, so the
  // extension keeps whatever it captured from the page.
  description?: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

/** Extract structured job fields (+ a cleaned description) from page text, logging token use. */
export async function extractJob(
  userId: string,
  input: ExtractInput,
): Promise<ExtractionResult> {
  const contextChars = input.text.length
  const startedAt = Date.now()

  let result
  try {
    result = await groqChat(buildExtractionMessages(input.text), {
      model: env.GROQ_MODEL,
      maxTokens: 6000,
      reasoningEffort: "low",
    })
  } catch (err) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: env.GROQ_MODEL,
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: false,
    })
    if (err instanceof ApiError) throw err
    throw new ApiError("INTERNAL", `Extraction failed: ${String(err)}`)
  }

  const parsed = normalizeExtractedFields(result.content)
  const { description, ...fields } = parsed

  if (result.usage.cachedInputTokens > 0) {
    console.log(
      `[extractions] prompt cache hit: ${result.usage.cachedInputTokens}/${result.usage.inputTokens} input tokens reused`,
    )
  }

  await logExtraction({
    userId,
    source: input.source,
    url: input.url,
    model: result.model,
    ...result.usage,
    contextChars,
    durationMs: Date.now() - startedAt,
    success: true,
  })

  return { fields, description, usage: result.usage }
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
    console.error("[extractions] failed to write ExtractionLog:", err)
  }
}
