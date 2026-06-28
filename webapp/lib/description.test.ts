import { describe, expect, it } from "vitest"

import { looksFormatted, parseDescription, parseInline } from "./description"

describe("looksFormatted", () => {
  it("detects markdown headings", () => {
    expect(looksFormatted("### Required Qualifications:\nsome text")).toBe(true)
  })

  it("detects dash and bullet lists", () => {
    expect(looksFormatted("- 3+ years of experience")).toBe(true)
    expect(looksFormatted("• Family Planning Support")).toBe(true)
  })

  it("detects numbered lists and bold", () => {
    expect(looksFormatted("1. First step")).toBe(true)
    expect(looksFormatted("We offer **great** benefits")).toBe(true)
  })

  it("returns false for plain prose", () => {
    expect(looksFormatted("We are a fast growing team building great products.")).toBe(false)
  })
})

describe("parseDescription", () => {
  it("groups consecutive bullets into one list under a heading", () => {
    const blocks = parseDescription(
      "### Required Qualifications:\n- 3+ years of software development\n- Able to take ownership",
    )
    expect(blocks).toEqual([
      { kind: "heading", level: 3, spans: [{ kind: "text", text: "Required Qualifications:" }] },
      {
        kind: "list",
        ordered: false,
        items: [
          [{ kind: "text", text: "3+ years of software development" }],
          [{ kind: "text", text: "Able to take ownership" }],
        ],
      },
    ])
  })

  it("treats htmlToText bullets (•) as a list", () => {
    const blocks = parseDescription("• Gender-Affirming Care\n• Mental Health & Coaching")
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false })
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2)
  })

  it("starts a fresh list when switching ordered/unordered", () => {
    const blocks = parseDescription("- a\n- b\n1. one\n2. two")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false })
    expect(blocks[1]).toMatchObject({ kind: "list", ordered: true })
  })

  it("keeps consecutive plain lines in one paragraph and splits on blank lines", () => {
    const blocks = parseDescription("Line one\nLine two\n\nSecond paragraph")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: "paragraph" })
    expect((blocks[0] as { lines: unknown[] }).lines).toHaveLength(2)
    expect(blocks[1]).toMatchObject({ kind: "paragraph" })
  })
})

describe("parseInline", () => {
  it("extracts bold spans", () => {
    expect(parseInline("We offer **great** benefits")).toEqual([
      { kind: "text", text: "We offer " },
      { kind: "strong", text: "great" },
      { kind: "text", text: " benefits" },
    ])
  })

  it("extracts http links and leaves other brackets literal", () => {
    expect(parseInline("Apply [here](https://jobs.example.com/1) now")).toEqual([
      { kind: "text", text: "Apply " },
      { kind: "link", text: "here", href: "https://jobs.example.com/1" },
      { kind: "text", text: " now" },
    ])
    expect(parseInline("Salary [TBD] for now")).toEqual([{ kind: "text", text: "Salary [TBD] for now" }])
  })
})
