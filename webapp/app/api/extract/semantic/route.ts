/**
 * POST /api/extract/semantic
 *
 * Semantic job-detail extraction (markdown → sections → bounded RAG → one Groq call).
 * Parses the captured markdown into semantic sections, embeds chunks (OpenRouter), assembles a
 * token-bounded context, and synthesizes the detail fields with Groq — avoiding the 413 that the
 * whole-page path hits, with no upstream truncation.
 *
 * Request body: { text: string, source?: string, url?: string }
 * Response: { data: { fields, description, usage, metadata } }
 */

import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { buildChunkIndex, extractJobDetailsSemanticRAG } from "@/lib/server/job-extraction-semantic"
import { extractInputSchema } from "@/lib/validations/extract"
import { ApiError } from "@/lib/api/errors"

// Parsing is local + instant; the cost is one embeddings batch + one Groq call. 30s is ample and
// keeps a stuck upstream from hanging the request indefinitely.
export const maxDuration = 30

export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = extractInputSchema.parse(await req.json())

  const startedAt = Date.now()
  console.log(
    `[api/extract/semantic] user=${userId} source=${input.source} chars=${input.text.length}`,
  )

  try {
    const { index, cacheHit } = await buildChunkIndex(input.text, input.url || "unknown")
    const extraction = await extractJobDetailsSemanticRAG(index, cacheHit)

    const m = extraction.metadata
    console.log(
      `[api/extract/semantic] done in ${Date.now() - startedAt}ms |`,
      `sections=${m.totalSections} chunks=${m.totalChunks} used=${m.chunksUsed} |`,
      `ctx=${m.contextTokens}t groq=${m.inputTokensUsed}in/${m.outputTokensUsed}out |`,
      `cache=${m.cacheHit} |`,
      `fields=[${Object.entries(extraction.fields).filter(([, v]) => v).map(([k]) => k).join(",")}]`,
    )

    return ok({
      fields: extraction.fields,
      description: extraction.fields.description,
      usage: {
        inputTokens: m.inputTokensUsed,
        outputTokens: m.outputTokensUsed,
        totalTokens: m.inputTokensUsed + m.outputTokensUsed,
        cachedInputTokens: 0,
      },
      metadata: m,
    })
  } catch (err) {
    console.error("[api/extract/semantic] failed:", err)
    if (err instanceof ApiError) throw err
    throw new ApiError("INTERNAL", `Semantic extraction failed: ${String(err)}`)
  }
})

export const OPTIONS = preflight
