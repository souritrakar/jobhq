import { describe, expect, it } from "vitest"

import {
  buildIndexedDetailsMessages,
  containsOnPage,
  renderDescription,
  resolveIndexedDetails,
} from "@/lib/llm/indexed-details"
import { pagePrefixMessages, type CapturedBlock } from "@/lib/llm/indexed-shared"

const B = (i: number, kind: CapturedBlock["kind"], text: string): CapturedBlock => ({ i, kind, text })

const PAGE: CapturedBlock[] = [
  B(0, "heading", "# Software Engineering Intern"),
  B(1, "para", "Acme Robotics · Remote — Ontario, Canada"),
  B(2, "heading", "## About the role"),
  B(3, "para", "Build robots that build robots."),
  B(4, "li", "- Ship weekly"),
  B(5, "field", '[field q1: text "Full name"]'),
  B(6, "para", "Salary: CAD $60,000 - $75,000 per year"),
]

describe("buildIndexedDetailsMessages", () => {
  it("starts with the byte-identical cached page prefix", () => {
    const msgs = buildIndexedDetailsMessages(PAGE)
    expect(msgs.slice(0, 2)).toEqual(pagePrefixMessages(PAGE))
    expect(msgs).toHaveLength(3)
    expect(msgs[2].cache).toBeUndefined()
  })
})

describe("containsOnPage", () => {
  it("is case/whitespace/punctuation/unicode-dash insensitive", () => {
    const hay = "Remote — Ontario,  Canada"
    expect(containsOnPage("remote - ontario canada", hay)).toBe(true)
    expect(containsOnPage("Berlin", hay)).toBe(false)
  })
  it("rejects empty normalizations rather than trivially matching", () => {
    expect(containsOnPage("—", "anything")).toBe(false)
  })
})

describe("renderDescription", () => {
  it("slices verbatim, skips excluded and field blocks, keeps markdown shape", () => {
    const out = renderDescription(PAGE, { start: 2, end: 6, exclude: [6] })
    expect(out).toBe("## About the role\n\nBuild robots that build robots.\n- Ship weekly")
  })
  it("returns null on invalid ranges", () => {
    expect(renderDescription(PAGE, { start: 5, end: 2 })).toBeNull()
    expect(renderDescription(PAGE, { start: 0, end: 999 })).toBeNull()
    expect(renderDescription(PAGE, { start: -1, end: 2 })).toBeNull()
  })
  it("returns null when the slice is only field blocks", () => {
    expect(renderDescription(PAGE, { start: 5, end: 5 })).toBeNull()
  })
})

describe("resolveIndexedDetails", () => {
  const good = {
    title: "Software Engineering Intern",
    company: "Acme Robotics",
    location: "Remote — Ontario, Canada",
    salary: "CAD $60,000 - $75,000 per year",
    employmentType: "Internship",
    workplaceType: "Remote",
    descriptionRange: { start: 2, end: 4, exclude: [] },
    hasJobDetails: true,
    hasApplicationForm: true,
  }

  it("keeps values present on the page and slices the description", () => {
    const r = resolveIndexedDetails(good, PAGE)
    expect(r.fields.title).toBe("Software Engineering Intern")
    expect(r.fields.company).toBe("Acme Robotics")
    expect(r.fields.salary).toBe("CAD $60,000 - $75,000 per year")
    expect(r.description).toContain("Build robots")
    expect(r.detected).toEqual({ hasJobDetails: true, hasApplicationForm: true })
  })

  it("drops hallucinated values (not present on the page)", () => {
    const r = resolveIndexedDetails({ ...good, company: "Globex" }, PAGE)
    expect(r.fields.company).toBeUndefined()
  })

  it("drops invalid enums and invalid ranges without guessing", () => {
    const r = resolveIndexedDetails(
      { ...good, employmentType: "Gig", descriptionRange: { start: 9, end: 1 } },
      PAGE,
    )
    expect(r.fields.employmentType).toBeUndefined()
    expect(r.description).toBeUndefined()
  })

  it("null stays null; sentinel strings dropped by the existing sieve", () => {
    const r = resolveIndexedDetails(
      { ...good, salary: null, location: "N/A", descriptionRange: null },
      PAGE,
    )
    expect(r.fields.salary).toBeUndefined()
    expect(r.fields.location).toBeUndefined()
    expect(r.description).toBeUndefined()
  })

  it("accepts a title present only in the titleHint", () => {
    const r = resolveIndexedDetails(
      { ...good, title: "Intern - Acme Careers" },
      PAGE,
      "Intern - Acme Careers | Acme Robotics",
    )
    expect(r.fields.title).toBe("Intern - Acme Careers")
  })

  it("tolerates a fenced-JSON string reply", () => {
    const r = resolveIndexedDetails("```json\n" + JSON.stringify(good) + "\n```", PAGE)
    expect(r.fields.title).toBe("Software Engineering Intern")
  })

  it("returns empty result shape when the reply is unusable", () => {
    const r = resolveIndexedDetails("total garbage", PAGE)
    expect(r.fields).toEqual({})
    expect(r.description).toBeUndefined()
    expect(r.detected).toEqual({ hasJobDetails: false, hasApplicationForm: false })
  })
})
