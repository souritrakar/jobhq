import { beforeEach, describe, expect, it, vi } from "vitest"

const openRouterChat = vi.fn()
// Transport-failure injection happens in this plain wrapper, NOT via the vi.fn: vitest 4's
// spy settled-results tracking creates an orphan rejected promise when the spy itself
// throws/rejects, which gets mis-flagged as an unhandled rejection at the next hook boundary.
const transport: { error: Error | null } = { error: null }
vi.mock("@/lib/llm/openrouter", () => ({
  openRouterChat: (...a: unknown[]) => {
    if (transport.error) throw transport.error
    return openRouterChat(...a)
  },
}))
vi.mock("@/lib/db", () => ({ prisma: { extractionLog: { create: vi.fn().mockResolvedValue({}) } } }))

import { extractJobIndexed } from "@/lib/server/extractions-indexed"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

const USAGE = { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 0 }

function input(blockTexts: string[]): IndexedExtractInput {
  return {
    blocks: blockTexts.map((text, i) => ({ i, kind: "para" as const, text })),
    fields: [],
    source: "test",
    url: "https://x.test/job",
  }
}

beforeEach(() => {
  openRouterChat.mockReset()
  transport.error = null
})

describe("extractJobIndexed", () => {
  it("runs one call under budget and resolves deterministically", async () => {
    openRouterChat.mockResolvedValueOnce({
      content: JSON.stringify({
        title: "Intern", company: null, location: null, salary: null,
        employmentType: null, workplaceType: null,
        descriptionRange: { start: 0, end: 0, exclude: [] },
        hasJobDetails: true, hasApplicationForm: false,
      }),
      usage: USAGE,
      model: "test/model",
    })
    const body =
      "Intern wanted at Acme. You will build and operate our robot-assembly automation " +
      "platform, pairing with senior engineers across firmware, controls and cloud tooling " +
      "to ship reliable production systems to real customers every single week."
    const r = await extractJobIndexed("u1", input([body]))
    expect(openRouterChat).toHaveBeenCalledTimes(1)
    expect(r.fields.title).toBe("Intern")
    expect(r.description).toBe(body)
    expect(r.detected.hasJobDetails).toBe(true)
    expect(r.usage.totalTokens).toBe(120)
  })

  it("retries ONCE with a JSON nudge when the reply is unparsable, then succeeds", async () => {
    openRouterChat
      .mockResolvedValueOnce({ content: "not json at all", usage: USAGE, model: "m" })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: null, company: null, location: null, salary: null,
          employmentType: null, workplaceType: null, descriptionRange: null,
          hasJobDetails: false, hasApplicationForm: false,
        }),
        usage: USAGE,
        model: "m",
      })
    const r = await extractJobIndexed("u1", input(["hello"]))
    expect(openRouterChat).toHaveBeenCalledTimes(2)
    expect(r.fields).toEqual({})
  })

  it("runs the outline pre-pass when the page exceeds the token budget", async () => {
    // Build a page big enough to exceed INDEXED_TOKEN_BUDGET (24k tokens ≈ 96k chars):
    // 60 blocks × 1900 chars = 114k chars.
    const big = input(Array.from({ length: 60 }, (_, k) => `${k} ` + "x".repeat(1900)))
    openRouterChat
      .mockResolvedValueOnce({
        content: JSON.stringify({ regions: [{ start: 0, end: 3 }] }),
        usage: USAGE,
        model: "m",
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: null, company: null, location: null, salary: null,
          employmentType: null, workplaceType: null, descriptionRange: null,
          hasJobDetails: true, hasApplicationForm: false,
        }),
        usage: USAGE,
        model: "m",
      })
    await extractJobIndexed("u1", big)
    expect(openRouterChat).toHaveBeenCalledTimes(2)
    // The second (main) call's page prefix must only carry the kept blocks.
    const mainMessages = openRouterChat.mock.calls[1][0] as Array<{ content: string }>
    expect(mainMessages[1].content).toContain("B0|")
    expect(mainMessages[1].content).not.toContain("B59|")
  })

  it("throws (retryable) when the reply is unparsable even after the retry", async () => {
    // e.g. output truncated by max_tokens on both attempts — must NOT resolve to empty fields.
    openRouterChat
      .mockResolvedValueOnce({ content: '{"title": "cut off mid-js', usage: USAGE, model: "m" })
      .mockResolvedValueOnce({ content: '{"title": "cut off again', usage: USAGE, model: "m" })
    let err: unknown = null
    try {
      await extractJobIndexed("u1", input(["x"]))
    } catch (e) {
      err = e
    }
    expect((err as Error)?.name).toBe("ApiError")
    expect(String(err)).toContain("unreadable")
  })

  it("throws ApiError on transport failure", async () => {
    transport.error = new Error("boom")
    let err: unknown = null
    try {
      await extractJobIndexed("u1", input(["x"]))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).toBe("ApiError")
    expect(String(err)).toContain("Indexed extraction failed")
  })
})
