import type { NextRequest } from "next/server"

import { ApiError } from "@/lib/api/errors"
import { getUserId } from "@/lib/auth/current-user"
import { preflight, withRoute } from "@/lib/api/route"
import { coverLetterStream } from "@/lib/server/cover-letter-pipeline"
import { prepareCoverLetter } from "@/lib/server/cover-letter"
import { BillingUnavailableError, refundGeneration, reserveGeneration } from "@/lib/server/billing"
import { generateCoverLetterSchema } from "@/lib/validations/cover-letter"

// The pipeline runs two model calls back-to-back (generate, sometimes revise) plus a cheap judge and
// moderation, so give it room in production (Vercel kills the default ~10–15s).
export const maxDuration = 120

// POST /api/cover-letter — generate a tailored cover letter for a saved job (Stage 5 pipeline).
//
// The success body is an NDJSON PROGRESS STREAM (lib/cover-letter/progress.ts): status events while
// the pipeline runs, then exactly one terminal event — the finished, fully-vetted letter or a clean
// error. The raw draft is never streamed; only the vetted artifact is revealed.
//
// Everything that can fail cleanly BEFORE any model call — validation, job not found, unreadable
// resume, flagged instructions — is resolved in prepareCoverLetter and thrown as an ApiError, so it
// still surfaces as the standard `{ error }` JSON envelope (withRoute handles the throw) before the
// stream opens. Failures AFTER the stream opens arrive as a terminal `error` event instead.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = generateCoverLetterSchema.parse(await req.json())

  // Pre-generation gates (cheap): resume resolution + input moderation. Throws → JSON error envelope.
  const prepared = await prepareCoverLetter(userId, input)

  // Meter gate: reserve 1 generation atomically (concurrency-safe). 402 if the free monthly limit is
  // spent (Pro is unlimited, always allowed); 503 if Autumn can't be reached (fail-closed — an outage
  // must never let generation through uncounted).
  let reservation: { allowed: boolean; remaining: number | null }
  try {
    reservation = await reserveGeneration(userId)
  } catch (e) {
    if (e instanceof BillingUnavailableError) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Billing is temporarily unavailable. Please try again.")
    }
    throw e
  }
  if (!reservation.allowed) {
    throw new ApiError(
      "PAYMENT_REQUIRED",
      "You've used your 8 free generations this month. Upgrade to Pro for unlimited.",
    )
  }

  // Generation → guard → eval → revise → moderation, emitting progress + one terminal event. Refund
  // the reserved unit if the pipeline ends WITHOUT delivering a letter (best-effort, never throws).
  const stream = coverLetterStream(prepared, {
    onSettled: (delivered) => {
      if (!delivered) void refundGeneration(userId)
    },
  })

  return new Response(stream, {
    headers: {
      // NDJSON, but text/plain keeps the fetch/stream handling identical on the client.
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Disable proxy buffering so progress events reach the browser as they're produced.
      "X-Accel-Buffering": "no",
    },
  })
})

export const OPTIONS = preflight
