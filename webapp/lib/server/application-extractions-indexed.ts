import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import type { ApplicationQuestion } from "@/lib/llm/application-extraction"
import type { Detected } from "@/lib/llm/indexed-details"
import {
  buildIndexedQuestionsMessages,
  QUESTIONS_RESPONSE_FORMAT,
  resolveIndexedQuestions,
} from "@/lib/llm/indexed-questions"
import {
  logExtraction,
  reduceBlocksIfOversized,
  runIndexedCall,
} from "@/lib/server/extractions-indexed"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

/**
 * Indexed application-question extraction service. The model CLASSIFIES the harvested DOM
 * controls (it can't invent one); options/placeholders come from the DOM verbatim; the merge
 * (type matrix, consent filter, DOM order) is deterministic in lib/llm/indexed-questions.ts.
 * Zero harvested fields → { questions: [] } with NO model call — there is nothing to classify.
 */

export type IndexedApplicationResult = {
  questions: ApplicationQuestion[]
  detected: Detected
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

export async function extractApplicationIndexed(
  userId: string,
  input: IndexedExtractInput,
): Promise<IndexedApplicationResult> {
  const contextChars = input.blocks.reduce((n, b) => n + b.text.length, 0)
  const startedAt = Date.now()

  if (!input.fields.length) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: "indexed:no-fields",
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: true,
    })
    return {
      questions: [],
      detected: { hasJobDetails: false, hasApplicationForm: false },
      usage: ZERO_USAGE,
    }
  }

  try {
    const { blocks, outlineUsage, outlined } = await reduceBlocksIfOversized(
      input.blocks,
      "questions",
    )
    const { result, parsed } = await runIndexedCall(
      buildIndexedQuestionsMessages(blocks, input.fields),
      QUESTIONS_RESPONSE_FORMAT,
      "JobTracker Indexed Questions",
    )
    const resolved = resolveIndexedQuestions(parsed, input.fields)
    const usage = {
      inputTokens: result.usage.inputTokens + outlineUsage.inputTokens,
      outputTokens: result.usage.outputTokens + outlineUsage.outputTokens,
      totalTokens: result.usage.totalTokens + outlineUsage.totalTokens,
    }
    if (result.usage.cachedTokens > 0) {
      console.log(
        `[application-extractions-indexed] prompt cache hit: ${result.usage.cachedTokens}/${result.usage.inputTokens} input tokens reused`,
      )
    }
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: `indexed${outlined ? "+outline" : ""}:${result.model}`,
      ...usage,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: true,
    })
    return { ...resolved, usage }
  } catch (err) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: `indexed:${env.EXTRACTION_MODEL}`,
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: false,
    })
    if (err instanceof ApiError) throw err
    throw new ApiError("INTERNAL", `Indexed application extraction failed: ${String(err)}`)
  }
}
