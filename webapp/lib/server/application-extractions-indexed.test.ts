import { beforeEach, describe, expect, it, vi } from "vitest"

const openRouterChat = vi.fn()
vi.mock("@/lib/llm/openrouter", () => ({ openRouterChat: (...a: unknown[]) => openRouterChat(...a) }))
vi.mock("@/lib/db", () => ({ prisma: { extractionLog: { create: vi.fn().mockResolvedValue({}) } } }))

import { extractApplicationIndexed } from "@/lib/server/application-extractions-indexed"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

const USAGE = { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 0 }

beforeEach(() => openRouterChat.mockReset())

describe("extractApplicationIndexed", () => {
  it("returns { questions: [] } with NO model call when zero fields were harvested", async () => {
    const input: IndexedExtractInput = {
      blocks: [{ i: 0, kind: "para", text: "Just a description page" }],
      fields: [],
      source: "t",
      url: "https://x.test",
    }
    const r = await extractApplicationIndexed("u1", input)
    expect(openRouterChat).not.toHaveBeenCalled()
    expect(r.questions).toEqual([])
    expect(r.detected.hasApplicationForm).toBe(false)
    expect(r.usage.totalTokens).toBe(0)
  })

  it("classifies harvested fields through the model and merges deterministically", async () => {
    const input: IndexedExtractInput = {
      blocks: [{ i: 0, kind: "field", text: '[field q1: dropdown "Country" — options: US | CA]' }],
      fields: [{ id: "q1", label: "Country", kind: "select", options: ["US", "CA"] }],
      source: "t",
      url: "https://x.test",
    }
    openRouterChat.mockResolvedValueOnce({
      content: JSON.stringify({
        hasApplicationForm: true,
        questions: [
          { fieldId: "q1", include: true, label: "Country", type: "select", required: false, helpText: null },
        ],
      }),
      usage: USAGE,
      model: "m",
    })
    const r = await extractApplicationIndexed("u1", input)
    expect(openRouterChat).toHaveBeenCalledTimes(1)
    expect(r.questions).toEqual([{ label: "Country", type: "select", options: ["US", "CA"] }])
    expect(r.detected.hasApplicationForm).toBe(true)
  })

  it("scales the output-token cap with the harvested field count", async () => {
    const fields = Array.from({ length: 50 }, (_, i) => ({
      id: `q${i + 1}`,
      label: `Question ${i + 1}`,
      kind: "text" as const,
    }))
    openRouterChat.mockResolvedValueOnce({
      content: JSON.stringify({ hasApplicationForm: true, questions: [] }),
      usage: USAGE,
      model: "m",
    })
    await extractApplicationIndexed("u1", {
      blocks: [{ i: 0, kind: "para", text: "form page" }],
      fields,
      source: "t",
      url: "https://x.test",
    })
    const opts = openRouterChat.mock.calls[0][1] as { maxTokens: number }
    expect(opts.maxTokens).toBe(500 + 50 * 80)
  })

  it("throws (retryable) when the reply is unparsable even after the retry", async () => {
    // A truncated JSON reply must surface the error/retry UI, never the
    // "no application form" empty state on a page that has one.
    const input: IndexedExtractInput = {
      blocks: [{ i: 0, kind: "field", text: '[field q1: text "Name"]' }],
      fields: [{ id: "q1", label: "Name", kind: "text" }],
      source: "t",
      url: "https://x.test",
    }
    openRouterChat
      .mockResolvedValueOnce({ content: '{"questions": [truncat', usage: USAGE, model: "m" })
      .mockResolvedValueOnce({ content: '{"questions": [truncat', usage: USAGE, model: "m" })
    let err: unknown = null
    try {
      await extractApplicationIndexed("u1", input)
    } catch (e) {
      err = e
    }
    expect((err as Error)?.name).toBe("ApiError")
    expect(String(err)).toContain("unreadable")
  })
})
