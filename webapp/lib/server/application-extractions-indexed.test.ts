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
})
