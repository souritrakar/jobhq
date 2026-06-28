import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { preflight, withRoute } from "@/lib/api/route"
import { streamCoverLetter } from "@/lib/llm/openrouter-stream"
import { prepareCoverLetter } from "@/lib/server/cover-letter"
import { generateCoverLetterSchema } from "@/lib/validations/cover-letter"

// Letter generation streams token-by-token and can run longer than a default function budget,
// so give it room in production (Vercel kills the default ~10–15s).
export const maxDuration = 120

// POST /api/cover-letter — stream a tailored cover letter for a saved job.
//
// Unlike the JSON endpoints, the success response is a RAW TEXT STREAM (the letter, as it's
// written) so the UI can render it live. Everything that can fail cleanly — validation, job not
// found, missing/rate-limited model — is resolved BEFORE the stream opens, so those still come back
// as the standard `{ error }` JSON envelope (withRoute handles the throw). Once bytes start, the
// stream just ends on an upstream error; the client treats a truncated draft as retryable.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = generateCoverLetterSchema.parse(await req.json())

  const { messages, temperature, maxTokens } = await prepareCoverLetter(userId, input)
  const stream = await streamCoverLetter(messages, { temperature, maxTokens })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Disable proxy buffering so chunks reach the browser as they're produced.
      "X-Accel-Buffering": "no",
    },
  })
})

export const OPTIONS = preflight
