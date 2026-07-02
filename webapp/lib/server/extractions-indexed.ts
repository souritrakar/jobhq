import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { env } from "@/lib/env"
import type { ExtractedJob } from "@/lib/llm/extraction"
import {
  buildIndexedDetailsMessages,
  DETAILS_RESPONSE_FORMAT,
  resolveIndexedDetails,
  type Detected,
} from "@/lib/llm/indexed-details"
import {
  asObject,
  buildOutlineMessages,
  estimateTokens,
  parseOutlineRegions,
  sliceRegions,
  type CapturedBlock,
} from "@/lib/llm/indexed-shared"
import { openRouterChat, type ChatResult, type LlmMessage } from "@/lib/llm/openrouter"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

/**
 * Indexed details extraction service — the block-addressed OpenRouter pipeline.
 *
 * Under INDEXED_TOKEN_BUDGET: ONE model call over the full block doc. Over it: an outline
 * pre-pass picks the relevant regions first (rare — real postings compress well below the
 * budget). The model answers with values + a description block RANGE; resolution is
 * deterministic (verbatim slice, containment check) in lib/llm/indexed-details.ts.
 */

export type IndexedExtractionResult = {
  fields: ExtractedJob
  description?: string
  detected: Detected
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
const MAX_OUTPUT_TOKENS = 1200

export function extractionModels(): string[] {
  return [env.EXTRACTION_MODEL, ...env.EXTRACTION_FALLBACK_MODELS.split(",")]
    .map((m) => m.trim())
    .filter(Boolean)
}

/**
 * One chat call whose reply must parse as a JSON object; on a parse failure, ONE retry with
 * an explicit nudge appended. Shared by the details and questions services. `maxTokens` is
 * caller-set because the questions task's output scales with the form's field count — a cap
 * that truncates the JSON mid-array parses as null and would read as "no questions found".
 */
export async function runIndexedCall(
  messages: LlmMessage[],
  responseFormat: Record<string, unknown>,
  title: string,
  maxTokens: number = MAX_OUTPUT_TOKENS,
): Promise<{ result: ChatResult; parsed: Record<string, unknown> | null; calls: number }> {
  const models = extractionModels()
  const first = await openRouterChat(messages, {
    models,
    temperature: 0,
    maxTokens,
    responseFormat,
    title,
  })
  let parsed = asObject(first.content)
  if (parsed) return { result: first, parsed, calls: 1 }

  const retryMessages: LlmMessage[] = [
    ...messages,
    {
      role: "user",
      content:
        "Your previous reply was not valid JSON. Return ONLY the JSON object matching the requested shape — no prose, no code fences.",
    },
  ]
  const second = await openRouterChat(retryMessages, {
    models,
    temperature: 0,
    maxTokens,
    responseFormat,
    title,
  })
  parsed = asObject(second.content)
  return {
    result: {
      ...second,
      usage: {
        inputTokens: first.usage.inputTokens + second.usage.inputTokens,
        outputTokens: first.usage.outputTokens + second.usage.outputTokens,
        totalTokens: first.usage.totalTokens + second.usage.totalTokens,
        cachedTokens: first.usage.cachedTokens + second.usage.cachedTokens,
      },
    },
    parsed,
    calls: 2,
  }
}

/**
 * When the block doc exceeds the token budget, ask for the relevant regions first and keep
 * only those blocks (plus the always-keep head and every field block). On ANY outline
 * failure, fall back to a deterministic clamp — never fail the extraction for the pre-pass.
 * Returns the (possibly reduced) blocks and the outline call's usage to fold into the log.
 */
export async function reduceBlocksIfOversized(
  blocks: CapturedBlock[],
  task: "details" | "questions",
): Promise<{ blocks: CapturedBlock[]; outlineUsage: typeof ZERO_USAGE; outlined: boolean }> {
  if (estimateTokens(blocks) <= env.INDEXED_TOKEN_BUDGET) {
    return { blocks, outlineUsage: ZERO_USAGE, outlined: false }
  }
  try {
    const res = await openRouterChat(buildOutlineMessages(blocks, task), {
      models: extractionModels(),
      temperature: 0,
      maxTokens: 400,
      title: "JobTracker Indexed Outline",
    })
    const regions = parseOutlineRegions(asObject(res.content), blocks.length)
    if (regions) {
      return {
        blocks: sliceRegions(blocks, regions),
        outlineUsage: {
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          totalTokens: res.usage.totalTokens,
        },
        outlined: true,
      }
    }
  } catch (err) {
    console.warn("[extractions-indexed] outline pre-pass failed, clamping:", String(err))
  }
  // Deterministic fallback: budget-worth of chars from the top + every field block.
  const budgetChars = env.INDEXED_TOKEN_BUDGET * 4
  let total = 0
  const kept: CapturedBlock[] = []
  for (const b of blocks) {
    if (b.kind === "field") {
      kept.push(b)
      continue
    }
    total += b.text.length
    if (total <= budgetChars) kept.push(b)
  }
  return { blocks: kept, outlineUsage: ZERO_USAGE, outlined: true }
}

export async function extractJobIndexed(
  userId: string,
  input: IndexedExtractInput,
): Promise<IndexedExtractionResult> {
  const contextChars = input.blocks.reduce((n, b) => n + b.text.length, 0)
  const startedAt = Date.now()

  try {
    const { blocks, outlineUsage, outlined } = await reduceBlocksIfOversized(
      input.blocks,
      "details",
    )
    const { result, parsed } = await runIndexedCall(
      buildIndexedDetailsMessages(blocks, input.titleHint),
      DETAILS_RESPONSE_FORMAT,
      "JobTracker Indexed Details",
    )
    // A still-unparsable reply after the retry is a FAILURE (surface the retry UI) — resolving
    // it would silently show an empty form/blank fields as if the page had none.
    if (!parsed) {
      throw new ApiError("INTERNAL", "The AI service returned an unreadable reply. Please try again.")
    }
    const resolved = resolveIndexedDetails(parsed, blocks, input.titleHint)
    const usage = {
      inputTokens: result.usage.inputTokens + outlineUsage.inputTokens,
      outputTokens: result.usage.outputTokens + outlineUsage.outputTokens,
      totalTokens: result.usage.totalTokens + outlineUsage.totalTokens,
    }
    if (result.usage.cachedTokens > 0) {
      console.log(
        `[extractions-indexed] prompt cache hit: ${result.usage.cachedTokens}/${result.usage.inputTokens} input tokens reused`,
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
    throw new ApiError("INTERNAL", `Indexed extraction failed: ${String(err)}`)
  }
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

export async function logExtraction(input: LogInput) {
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
    console.error("[extractions-indexed] failed to write ExtractionLog:", err)
  }
}
