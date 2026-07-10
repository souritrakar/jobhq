/**
 * Cover-letter generation pipeline (Stage 5) — server-only orchestration.
 *
 * This is the cost-ordered gate pipeline the route runs AFTER the pre-generation checks
 * (prepareCoverLetter, lib/server/cover-letter.ts) have passed. It is an evaluator-optimizer
 * (Anthropic, "Building Effective Agents") composed as a deterministic prompt chain with a guardrail
 * at every hop — no autonomous agent, just a fixed, auditable sequence:
 *
 *   drafting   4. generate draft                    (EXPENSIVE #1)
 *              5. deterministic guard (free)         refusal/leak → STOP, no eval/revise/moderation
 *   reviewing  6. rubric judge (cheap)               PASS → ship; flag gaps → revise    (fail-open)
 *   polishing  7. revise → improved (EXPENSIVE #2)   only when the draft is clean AND gaps were flagged
 *              5'. re-run the free guard on the improved text (leak → discard, ship the clean draft)
 *              8. output moderation (cheap)          once, on the FINAL text only        (fail-open)
 *              9. reveal the vetted artifact
 *
 * The two expensive calls (generate, revise) are each shielded by cheaper checks so a request that
 * will fail/flag dies as early as possible. The raw draft is NEVER shown; the client sees progress
 * events and then exactly one terminal event (letter or error).
 *
 * Everything after generation FAILS OPEN: a flaky judge/reviser/classifier degrades to "ship the
 * safe, already-vetted draft," never to a blocked user. Model calls are DEPENDENCY-INJECTED so the
 * decision logic is unit-testable without the network (see cover-letter-pipeline.test.ts).
 */

import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import {
  buildCoverLetterMessages,
  COVER_LETTER_MAX_TOKENS,
  COVER_LETTER_TEMPERATURE,
} from "@/lib/llm/cover-letter"
import {
  buildEvalMessages,
  EVAL_MAX_TOKENS,
  EVAL_TEMPERATURE,
  evalModelChain,
  parseEvalVerdict,
  renderGapsForRevise,
  type EvalVerdict,
} from "@/lib/llm/cover-letter-eval"
import {
  buildReviseMessages,
  REVISE_TEMPERATURE,
  reviseModelChain,
} from "@/lib/llm/cover-letter-revise"
import { moderateText } from "@/lib/llm/moderation"
import { openRouterChat, type LlmMessage } from "@/lib/llm/openrouter"
import { classifyOutput } from "@/lib/cover-letter/output-guard"
import { encodeEvent, type ProgressEvent } from "@/lib/cover-letter/progress"
import type { PreparedCoverLetter } from "@/lib/server/cover-letter"

// User-facing messages. Specific and non-technical — they never leak model names, HTTP codes, stack
// traces, category codes, or which guardrail fired (§3.3 of the spec).
const GENERATION_FAILED_MESSAGE = "We couldn't draft your letter right now. Please try again."
const RATE_LIMITED_MESSAGE =
  "The AI service is busy. Please wait a few seconds and try again."
const TIMEOUT_MESSAGE = "This is taking longer than expected. Please try again."
const UNCLEAN_MESSAGE =
  "The letter didn't come out clean this time. Please try again — tweaking your instructions can help."
const SAFETY_MESSAGE =
  "This letter was withheld by our safety filter. Please adjust your instructions and try again."

/** Model-calling dependencies. Real implementations hit OpenRouter; tests pass fakes. */
export type PipelineDeps = {
  /** Generate a draft letter from the prepared inputs. Throws ApiError on a clean failure. */
  generate: (prepared: PreparedCoverLetter) => Promise<string>
  /** Grade a draft. Should NOT throw for a bad grade — throw only on transport failure (→ fail-open). */
  evaluate: (prepared: PreparedCoverLetter, letter: string) => Promise<EvalVerdict>
  /** Improve a letter per a revision directive. Throws on transport failure (→ ship the draft). */
  revise: (prepared: PreparedCoverLetter, currentLetter: string, revision: string) => Promise<string>
  /** Classify the FINAL text; resolves to whether it was flagged. Never throws (fail-open inside). */
  moderate: (text: string) => Promise<boolean>
}

export type PipelineConfig = {
  /** Kill switch — when false, Stage 5 (eval + revise) is skipped entirely. */
  evalEnabled: boolean
  /** How many revise passes a flagged draft may receive (v1 runs at most one). */
  maxRevisions: number
}

/** Resolve the user's tier. Stub for now (billing not built); the seam lets quality diverge later. */
export function resolveTier(_userId: string): "free" | "pro" {
  return "free"
}

/** Build the pipeline config from env + tier. The tier seam is designed but not yet metered (§8). */
export function resolvePipelineConfig(_tier: "free" | "pro" = "free"): PipelineConfig {
  return {
    evalEnabled: env.COVER_LETTER_EVAL_ENABLED,
    maxRevisions: env.EVAL_MAX_REVISIONS,
  }
}

// Mark the system message as a prompt-cache breakpoint (static prefix reused across calls).
function withCachedSystem(messages: LlmMessage[]): LlmMessage[] {
  return messages.map((m) => (m.role === "system" ? { ...m, cache: true } : m))
}

/** Primary model first, then comma-separated fallbacks, in order, deduped. */
function modelChain(model: string, fallbacks: string): string[] {
  const extra = fallbacks
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return [model, ...extra].filter((m, i, a) => Boolean(m) && a.indexOf(m) === i)
}

/** The real, network-backed dependencies. */
export function realDeps(): PipelineDeps {
  return {
    generate: async (p) => {
      const messages = withCachedSystem(
        buildCoverLetterMessages({
          job: p.job,
          resumeText: p.resumeText,
          instructions: p.instructions,
        }),
      )
      const { content } = await openRouterChat(messages, {
        models: modelChain(env.COVER_LETTER_MODEL, env.COVER_LETTER_FALLBACK_MODELS),
        temperature: COVER_LETTER_TEMPERATURE,
        maxTokens: COVER_LETTER_MAX_TOKENS,
        title: "jobhq - Cover Letter",
      })
      return content.trim()
    },

    evaluate: async (p, letter) => {
      const messages = buildEvalMessages({
        job: p.job,
        resumeText: p.resumeText,
        instructions: p.instructions,
        letter,
      })
      const { content } = await openRouterChat(messages, {
        models: evalModelChain(env.EVAL_MODEL, env.EVAL_FALLBACK_MODELS),
        temperature: EVAL_TEMPERATURE,
        maxTokens: EVAL_MAX_TOKENS,
        title: "jobhq - Cover Letter Eval",
      })
      return parseEvalVerdict(content)
    },

    revise: async (p, currentLetter, revision) => {
      const messages = withCachedSystem(
        buildReviseMessages({
          job: p.job,
          resumeText: p.resumeText,
          instructions: p.instructions,
          currentLetter,
          revision,
        }),
      )
      const { content } = await openRouterChat(messages, {
        models: reviseModelChain(env.REVISE_MODEL, env.REVISE_FALLBACK_MODELS),
        temperature: REVISE_TEMPERATURE,
        maxTokens: COVER_LETTER_MAX_TOKENS,
        title: "jobhq - Cover Letter Revise",
      })
      return content.trim()
    },

    moderate: async (text) => (await moderateText(text)).flagged,
  }
}

// Map a generation failure to a safe, specific, non-technical error event (never the raw message).
function generationErrorEvent(err: unknown): ProgressEvent {
  if (err instanceof ApiError) {
    if (err.code === "RATE_LIMITED") {
      return { t: "error", code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE }
    }
    if (/too long|timed out|timeout/i.test(err.message)) {
      return { t: "error", code: "TIMEOUT", message: TIMEOUT_MESSAGE }
    }
  }
  return { t: "error", code: "GENERATION_FAILED", message: GENERATION_FAILED_MESSAGE }
}

/**
 * Run the pipeline, yielding progress + one terminal event. Deterministic orchestration; all model
 * work is in `deps`. Never throws — a clean failure is yielded as an `error` event (the stream has
 * already opened, so we can't switch to a JSON status).
 */
export async function* runPipeline(
  prepared: PreparedCoverLetter,
  config: PipelineConfig,
  deps: PipelineDeps,
): AsyncGenerator<ProgressEvent> {
  // 4. GENERATE — expensive #1.
  yield { t: "status", phase: "drafting" }
  let draft: string
  try {
    draft = await deps.generate(prepared)
  } catch (err) {
    yield generationErrorEvent(err)
    return
  }

  // 5. Deterministic guard (free) — a refusal or system-prompt leak never proceeds to the paid gates.
  if (classifyOutput(draft)) {
    yield { t: "error", code: "UNCLEAN", message: UNCLEAN_MESSAGE }
    return
  }

  let final = draft

  // 6–7. Quality gate + conditional revise (Stage 5). Skipped entirely when disabled.
  if (config.evalEnabled) {
    yield { t: "status", phase: "reviewing" }

    // Fail-open: any judge transport failure → treat as a pass (ship the vetted draft).
    let verdict: EvalVerdict | null = null
    try {
      verdict = await deps.evaluate(prepared, draft)
    } catch {
      verdict = null
    }

    const needsRevision =
      config.maxRevisions >= 1 &&
      verdict !== null &&
      verdict.parsed &&
      !verdict.pass &&
      verdict.gaps.length > 0

    if (needsRevision && verdict) {
      // 7. REVISE — expensive #2. Only reached for a clean draft the judge flagged with real gaps.
      yield { t: "status", phase: "polishing" }
      try {
        const improved = await deps.revise(prepared, draft, renderGapsForRevise(verdict.gaps))
        // 5'. Re-run the free guard on the improved text. If revising leaked, discard it and keep
        // the draft — we already possess a fully guard-clean artifact, so ship that rather than error.
        final = improved && !classifyOutput(improved) ? improved : draft
      } catch {
        // Revise failed → ship the clean draft (the improvement was best-effort, not required).
        final = draft
      }
    }
  }

  // 8. Output moderation — once, on the FINAL text only. Fail-open: a classifier error must not lose
  // an already-vetted letter (moderateText fails open internally; the guard here is belt-and-suspenders).
  let flagged = false
  try {
    flagged = await deps.moderate(final)
  } catch {
    flagged = false
  }
  if (flagged) {
    yield { t: "error", code: "SAFETY", message: SAFETY_MESSAGE }
    return
  }

  // 9. Reveal the vetted artifact.
  yield { t: "letter", text: final }
}

/**
 * Adapt the pipeline generator to a `ReadableStream` of NDJSON bytes for the route. Wires the real
 * dependencies and config unless overridden (tests inject their own). Any unexpected throw becomes a
 * terminal error event so the client always gets a clean, actionable end state.
 */
export function coverLetterStream(
  prepared: PreparedCoverLetter,
  opts: {
    config?: PipelineConfig
    deps?: PipelineDeps
    /** Called exactly once when the stream finishes; `delivered` is true iff a `{t:"letter"}` event
     * was emitted. Generic on purpose — the pipeline knows nothing about billing (see route). */
    onSettled?: (delivered: boolean) => void
  } = {},
): ReadableStream<Uint8Array> {
  const config = opts.config ?? resolvePipelineConfig()
  const deps = opts.deps ?? realDeps()
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sawLetter = false
      try {
        for await (const event of runPipeline(prepared, config, deps)) {
          if (event.t === "letter") sawLetter = true
          controller.enqueue(encoder.encode(encodeEvent(event)))
        }
      } catch (err) {
        // Belt-and-suspenders: runPipeline is written not to throw, but if it ever does we still end
        // with a clean error event rather than a truncated, terminal-event-less stream.
        console.error("[cover-letter-pipeline] unexpected error:", err)
        try {
          controller.enqueue(
            encoder.encode(
              encodeEvent({ t: "error", code: "GENERATION_FAILED", message: GENERATION_FAILED_MESSAGE }),
            ),
          )
        } catch {
          // The client already cancelled the stream — nothing left to deliver the error event to.
        }
      } finally {
        // Fire the settlement hook FIRST and unconditionally: it drives the billing refund, and must
        // run even if the client already cancelled the stream (which makes controller.close() below
        // throw "Invalid state: Controller is already closed"). If close() ran first and threw, this
        // hook would never fire and a cancelled generation would silently burn a paid reservation.
        opts.onSettled?.(sawLetter)
        try {
          controller.close()
        } catch {
          // Already closed/cancelled by the client — nothing to close.
        }
      }
    },
  })
}
