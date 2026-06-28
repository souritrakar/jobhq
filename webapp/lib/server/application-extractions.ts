import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { env } from "@/lib/env"
import { groqChat } from "@/lib/llm/groq"
import {
  buildApplicationMessages,
  normalizeApplicationQuestions,
  type ApplicationQuestion,
} from "@/lib/llm/application-extraction"
import type { ApplicationExtractInput } from "@/lib/validations/extract"

/**
 * Application-question extraction service — one Groq call per request.
 *
 * Sibling of extractions.ts. The extension captures the rendered application form's text;
 * we run a single JSON-mode model call that returns the form's questions as a typed array,
 * normalize it, and log the token usage to the shared ExtractionLog. All DB access is
 * userId-scoped. Failures throw; the calling route lets the extension fall back to a retry.
 */

export type ApplicationExtractionResult = {
  questions: ApplicationQuestion[]
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

/** Extract the application form's questions from page text, logging token use. */
export async function extractApplication(
  userId: string,
  input: ApplicationExtractInput,
): Promise<ApplicationExtractionResult> {
  const contextChars = input.text.length
  const startedAt = Date.now()

  let result
  try {
    result = await groqChat(buildApplicationMessages(input.text), {
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
    throw new ApiError("INTERNAL", `Application extraction failed: ${String(err)}`)
  }

  const { questions } = normalizeApplicationQuestions(result.content)

  if (result.usage.cachedInputTokens > 0) {
    console.log(
      `[application-extractions] prompt cache hit: ${result.usage.cachedInputTokens}/${result.usage.inputTokens} input tokens reused`,
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

  return { questions, usage: result.usage }
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
    console.error("[application-extractions] failed to write ExtractionLog:", err)
  }
}
