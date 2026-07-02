import { describe, expect, it } from "vitest"

import {
  buildOutlineMessages,
  estimateTokens,
  pagePrefixMessages,
  parseOutlineRegions,
  renderBlockDoc,
  renderOutline,
  sliceRegions,
  type CapturedBlock,
} from "@/lib/llm/indexed-shared"

const B = (i: number, kind: CapturedBlock["kind"], text: string): CapturedBlock => ({ i, kind, text })

describe("renderBlockDoc", () => {
  it("renders numbered lines keyed by block index", () => {
    expect(renderBlockDoc([B(0, "heading", "# Role"), B(1, "para", "Great job.")])).toBe(
      "B0| # Role\nB1| Great job.",
    )
  })
})

describe("pagePrefixMessages", () => {
  it("is byte-identical for the same blocks and marks both messages cacheable", () => {
    const blocks = [B(0, "para", "hello")]
    const a = pagePrefixMessages(blocks)
    const b = pagePrefixMessages(blocks)
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
    expect(a[0].role).toBe("system")
    expect(a.every((m) => m.cache)).toBe(true)
  })
})

describe("estimateTokens", () => {
  it("approximates chars/4 plus numbering overhead", () => {
    const blocks = [B(0, "para", "x".repeat(400))]
    const est = estimateTokens(blocks)
    expect(est).toBeGreaterThanOrEqual(100)
    expect(est).toBeLessThan(120)
  })
})

describe("renderOutline", () => {
  it("keeps headings and field blocks whole, truncates prose to 80 chars", () => {
    const blocks = [
      B(0, "heading", "## About"),
      B(1, "para", "p".repeat(200)),
      B(2, "field", '[field q1: text "Name"]'),
    ]
    const out = renderOutline(blocks)
    expect(out).toContain("B0| ## About")
    expect(out).toContain(`B1| ${"p".repeat(80)}…`)
    expect(out).toContain('B2| [field q1: text "Name"]')
  })
})

describe("parseOutlineRegions", () => {
  it("accepts valid regions and clamps to block count", () => {
    expect(parseOutlineRegions({ regions: [{ start: 2, end: 900 }] }, 10)).toEqual([
      { start: 2, end: 9 },
    ])
  })
  it("rejects malformed payloads", () => {
    expect(parseOutlineRegions({ regions: [{ start: 5, end: 2 }] }, 10)).toBeNull()
    expect(parseOutlineRegions({}, 10)).toBeNull()
    expect(parseOutlineRegions("nonsense", 10)).toBeNull()
  })
})

describe("sliceRegions", () => {
  it("keeps the region, the first 40 blocks, and every field block, in order without dupes", () => {
    const blocks: CapturedBlock[] = []
    for (let i = 0; i < 120; i++) {
      blocks.push(B(i, i === 100 ? "field" : "para", `t${i}`))
    }
    const kept = sliceRegions(blocks, [{ start: 60, end: 62 }])
    const ids = kept.map((b) => b.i)
    expect(ids.slice(0, 40)).toEqual([...Array(40).keys()]) // first-40 rule
    expect(ids).toContain(60)
    expect(ids).toContain(61)
    expect(ids).toContain(62)
    expect(ids).toContain(100) // field block always kept
    expect(new Set(ids).size).toBe(ids.length) // no dupes
    expect(ids).toEqual([...ids].sort((a, b) => a - b)) // original order
  })
})

describe("buildOutlineMessages", () => {
  it("mentions the task and asks for JSON regions", () => {
    const msgs = buildOutlineMessages([B(0, "para", "x")], "details")
    const text = msgs.map((m) => m.content).join("\n")
    expect(text).toContain("B0| x")
    expect(text).toContain('"regions"')
  })
})
