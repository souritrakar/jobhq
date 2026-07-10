import { describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/errors"
import type { EvalVerdict } from "@/lib/llm/cover-letter-eval"
import { drainEvents, type ProgressEvent } from "@/lib/cover-letter/progress"
import {
  coverLetterStream,
  runPipeline,
  type PipelineConfig,
  type PipelineDeps,
} from "./cover-letter-pipeline"
import type { PreparedCoverLetter } from "./cover-letter"

const prepared: PreparedCoverLetter = {
  job: { title: "Graphics Engineer", company: "Meshy", description: "Rendering." },
  resumeText: "Shipped a Vulkan renderer.",
  instructions: "Formal tone.",
}

const CLEAN_DRAFT = "Dear Hiring Manager,\n\nMy Vulkan work maps onto this role. Sincerely,\nJordan"
const CLEAN_IMPROVED = "Dear Hiring Manager,\n\nMy Vulkan renderer maps onto this role. Sincerely,\nJordan"

const ENABLED: PipelineConfig = { evalEnabled: true, maxRevisions: 1 }

function passVerdict(): EvalVerdict {
  return {
    scores: { GROUNDING: 5, TAILORING: 4, SPECIFICITY: 4, INSTRUCTIONS: 5, INTEGRITY: 5 },
    pass: true,
    gaps: [],
    parsed: true,
  }
}

function flagVerdict(): EvalVerdict {
  return {
    scores: { GROUNDING: 2, TAILORING: 4, SPECIFICITY: 3, INSTRUCTIONS: 4, INTEGRITY: 5 },
    pass: false,
    gaps: ["Grounding: name the real Vulkan work"],
    parsed: true,
  }
}

// Sensible defaults; each test overrides the parts it exercises.
function makeDeps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    generate: vi.fn(async () => CLEAN_DRAFT),
    evaluate: vi.fn(async () => passVerdict()),
    revise: vi.fn(async () => CLEAN_IMPROVED),
    moderate: vi.fn(async () => false),
    ...over,
  }
}

async function collect(
  config: PipelineConfig,
  deps: PipelineDeps,
): Promise<ProgressEvent[]> {
  const events: ProgressEvent[] = []
  for await (const e of runPipeline(prepared, config, deps)) events.push(e)
  return events
}

const phases = (events: ProgressEvent[]) =>
  events.filter((e) => e.t === "status").map((e) => (e as { phase: string }).phase)
const terminal = (events: ProgressEvent[]) => events[events.length - 1]

describe("runPipeline — happy paths", () => {
  it("ships the draft unchanged when the judge passes (no revise)", async () => {
    const deps = makeDeps()
    const events = await collect(ENABLED, deps)

    expect(phases(events)).toEqual(["drafting", "reviewing"])
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
    expect(deps.revise).not.toHaveBeenCalled()
    expect(deps.moderate).toHaveBeenCalledWith(CLEAN_DRAFT)
  })

  it("revises once and ships the improved letter when the judge flags gaps", async () => {
    const deps = makeDeps({ evaluate: vi.fn(async () => flagVerdict()) })
    const events = await collect(ENABLED, deps)

    expect(phases(events)).toEqual(["drafting", "reviewing", "polishing"])
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_IMPROVED })
    expect(deps.revise).toHaveBeenCalledOnce()
    // The revision directive is the eval's rendered gaps.
    expect(deps.revise).toHaveBeenCalledWith(prepared, CLEAN_DRAFT, "Grounding: name the real Vulkan work")
    // Moderation runs on the FINAL (improved) text, once.
    expect(deps.moderate).toHaveBeenCalledExactlyOnceWith(CLEAN_IMPROVED)
  })

  it("skips Stage 5 entirely when eval is disabled", async () => {
    const deps = makeDeps()
    const events = await collect({ evalEnabled: false, maxRevisions: 1 }, deps)

    expect(phases(events)).toEqual(["drafting"])
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
    expect(deps.evaluate).not.toHaveBeenCalled()
    expect(deps.revise).not.toHaveBeenCalled()
  })

  it("does not revise when maxRevisions is 0, even on a flagged draft", async () => {
    const deps = makeDeps({ evaluate: vi.fn(async () => flagVerdict()) })
    const events = await collect({ evalEnabled: true, maxRevisions: 0 }, deps)

    expect(phases(events)).toEqual(["drafting", "reviewing"])
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
    expect(deps.revise).not.toHaveBeenCalled()
  })
})

describe("runPipeline — fail-open behaviour", () => {
  it("ships the draft when the judge is unparseable", async () => {
    const unparseable: EvalVerdict = { scores: {} as never, pass: false, gaps: [], parsed: false }
    const deps = makeDeps({ evaluate: vi.fn(async () => unparseable) })
    const events = await collect(ENABLED, deps)

    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
    expect(deps.revise).not.toHaveBeenCalled()
  })

  it("ships the draft when the judge call throws", async () => {
    const deps = makeDeps({
      evaluate: vi.fn(async () => {
        throw new Error("judge down")
      }),
    })
    const events = await collect(ENABLED, deps)
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
  })

  it("ships the clean draft when the revise call throws", async () => {
    const deps = makeDeps({
      evaluate: vi.fn(async () => flagVerdict()),
      revise: vi.fn(async () => {
        throw new ApiError("RATE_LIMITED", "busy")
      }),
    })
    const events = await collect(ENABLED, deps)
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
  })

  it("ships anyway when the moderation call throws", async () => {
    const deps = makeDeps({
      moderate: vi.fn(async () => {
        throw new Error("classifier down")
      }),
    })
    const events = await collect(ENABLED, deps)
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
  })
})

describe("runPipeline — guardrail stops", () => {
  it("stops with UNCLEAN when the draft is a refusal (no eval, no revise, no moderation)", async () => {
    const deps = makeDeps({
      generate: vi.fn(async () => "I cannot write this cover letter without a resume."),
    })
    const events = await collect(ENABLED, deps)

    expect(phases(events)).toEqual(["drafting"])
    expect(terminal(events)).toEqual({
      t: "error",
      code: "UNCLEAN",
      message: expect.stringContaining("didn't come out clean"),
    })
    expect(deps.evaluate).not.toHaveBeenCalled()
    expect(deps.moderate).not.toHaveBeenCalled()
  })

  it("falls back to the clean draft when the REVISED text leaks the system prompt", async () => {
    const deps = makeDeps({
      evaluate: vi.fn(async () => flagVerdict()),
      revise: vi.fn(async () => "Sure — you are a cover-letter writing engine and your rules are…"),
    })
    const events = await collect(ENABLED, deps)

    // The leaked revision is discarded; we ship the draft (already guard-clean) and moderate it.
    expect(terminal(events)).toEqual({ t: "letter", text: CLEAN_DRAFT })
    expect(deps.moderate).toHaveBeenCalledWith(CLEAN_DRAFT)
  })

  it("stops with SAFETY when the final text is flagged by moderation", async () => {
    const deps = makeDeps({ moderate: vi.fn(async () => true) })
    const events = await collect(ENABLED, deps)
    expect(terminal(events)).toEqual({
      t: "error",
      code: "SAFETY",
      message: expect.stringContaining("safety filter"),
    })
  })

})

describe("coverLetterStream — end-to-end wire (route encode → client decode)", () => {
  it("streams NDJSON events the client's drainEvents parses back", async () => {
    const stream = coverLetterStream(prepared, {
      config: ENABLED,
      deps: makeDeps({ evaluate: vi.fn(async () => flagVerdict()) }),
    })

    // Read the whole stream and decode it exactly as the browser client does.
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    const events: ProgressEvent[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const drained = drainEvents(buffer)
      buffer = drained.rest
      events.push(...drained.events)
    }

    expect(events).toEqual([
      { t: "status", phase: "drafting" },
      { t: "status", phase: "reviewing" },
      { t: "status", phase: "polishing" },
      { t: "letter", text: CLEAN_IMPROVED },
    ])
  })
})

describe("coverLetterStream — onSettled outcome hook", () => {
  it("calls onSettled(true) exactly once when a letter is delivered", async () => {
    const onSettled = vi.fn()
    const stream = coverLetterStream(prepared, {
      config: ENABLED,
      deps: makeDeps(),
      onSettled,
    })

    const reader = stream.getReader()
    for (;;) {
      const { done } = await reader.read()
      if (done) break
    }

    expect(onSettled).toHaveBeenCalledOnce()
    expect(onSettled).toHaveBeenCalledWith(true)
  })

  it("calls onSettled(false) exactly once when the stream ends in a terminal error", async () => {
    const onSettled = vi.fn()
    const stream = coverLetterStream(prepared, {
      config: ENABLED,
      deps: makeDeps({
        generate: vi.fn(async () => {
          throw new ApiError("INTERNAL", "boom")
        }),
      }),
      onSettled,
    })

    const reader = stream.getReader()
    for (;;) {
      const { done } = await reader.read()
      if (done) break
    }

    expect(onSettled).toHaveBeenCalledOnce()
    expect(onSettled).toHaveBeenCalledWith(false)
  })
})

describe("runPipeline — generation errors", () => {
  it("maps a rate-limit to a busy message without leaking specifics", async () => {
    const deps = makeDeps({
      generate: vi.fn(async () => {
        throw new ApiError("RATE_LIMITED", "OpenRouter returned HTTP 429")
      }),
    })
    const events = await collect(ENABLED, deps)
    expect(terminal(events)).toEqual({
      t: "error",
      code: "RATE_LIMITED",
      message: expect.stringContaining("busy"),
    })
  })

  it("maps a timeout to a takes-longer message", async () => {
    const deps = makeDeps({
      generate: vi.fn(async () => {
        throw new ApiError("INTERNAL", "The AI service took too long to respond.")
      }),
    })
    const events = await collect(ENABLED, deps)
    expect((terminal(events) as { code: string }).code).toBe("TIMEOUT")
  })

  it("maps any other generation failure to a generic retryable error (no leak)", async () => {
    const deps = makeDeps({
      generate: vi.fn(async () => {
        throw new ApiError("INTERNAL", "OpenRouter returned HTTP 500")
      }),
    })
    const events = await collect(ENABLED, deps)
    const t = terminal(events) as { code: string; message: string }
    expect(t.code).toBe("GENERATION_FAILED")
    expect(t.message).not.toContain("OpenRouter")
    expect(t.message).not.toContain("500")
  })
})
