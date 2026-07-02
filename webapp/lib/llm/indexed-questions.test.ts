import { describe, expect, it } from "vitest"

import {
  buildIndexedQuestionsMessages,
  domDefaultType,
  isConsentNoise,
  resolveIndexedQuestions,
} from "@/lib/llm/indexed-questions"
import { pagePrefixMessages, type HarvestedField } from "@/lib/llm/indexed-shared"

const FIELDS: HarvestedField[] = [
  { id: "q1", label: "Full name", kind: "text", required: true },
  { id: "q2", label: "Country of residence", kind: "select", options: ["United States", "Canada"] },
  { id: "q3", label: "Are you authorized to work?", kind: "radio", options: ["Yes", "No"] },
  { id: "q4", label: "Why us?", kind: "textarea" },
  { id: "q5", label: "Resume", kind: "file", required: true },
  { id: "q6", label: "I agree to the privacy policy", kind: "checkbox" },
  { id: "q7", label: "Search jobs", kind: "text" },
  { id: "q8", label: "Years of React experience", kind: "text", inputType: "text" },
  { id: "q9", label: "Preferred locations", kind: "checkbox", options: ["Remote", "Hybrid", "On-site"] },
]

const decision = (fieldId: string, extra: Record<string, unknown> = {}) => ({
  fieldId,
  include: true,
  label: FIELDS.find((f) => f.id === fieldId)?.label ?? "Unknown",
  type: "short_text",
  ...extra,
})

describe("domDefaultType", () => {
  it("maps DOM kinds and native input types", () => {
    expect(domDefaultType({ id: "x", label: "", kind: "select" })).toBe("select")
    expect(domDefaultType({ id: "x", label: "", kind: "textarea" })).toBe("long_text")
    expect(domDefaultType({ id: "x", label: "", kind: "file" })).toBe("file")
    expect(domDefaultType({ id: "x", label: "", kind: "text", inputType: "email" })).toBe("email")
    expect(domDefaultType({ id: "x", label: "", kind: "combobox" })).toBe("select")
    expect(domDefaultType({ id: "x", label: "", kind: "contenteditable" })).toBe("long_text")
  })
})

describe("isConsentNoise", () => {
  it("flags privacy/terms/gdpr/newsletter labels", () => {
    expect(isConsentNoise("I agree to the privacy policy")).toBe(true)
    expect(isConsentNoise("I accept the Terms of Service")).toBe(true)
    expect(isConsentNoise("Subscribe to our newsletter")).toBe(true)
    expect(isConsentNoise("I consent to my data being processed")).toBe(true)
    expect(isConsentNoise("Do you consent to a background check?")).toBe(true)
    expect(isConsentNoise("Preferred locations")).toBe(false)
  })
})

describe("buildIndexedQuestionsMessages", () => {
  it("shares the byte-identical page prefix and lists the field manifest", () => {
    const blocks = [{ i: 0, kind: "para" as const, text: "Apply below" }]
    const msgs = buildIndexedQuestionsMessages(blocks, FIELDS)
    expect(msgs.slice(0, 2)).toEqual(pagePrefixMessages(blocks))
    expect(msgs[2].content).toContain("q2")
    expect(msgs[2].content).toContain("Country of residence")
  })
})

describe("resolveIndexedQuestions", () => {
  it("keeps included fields, copies options verbatim from the harvest, DOM order", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [
        decision("q3", { type: "radio" }),
        decision("q1", { type: "short_text" }),
        decision("q2", { type: "select", label: "Country" }),
      ],
    }
    const { questions } = resolveIndexedQuestions(raw, FIELDS)
    expect(questions.map((q) => q.label)).toEqual([
      "Full name", "Country", "Are you authorized to work?",
    ]) // re-sorted to DOM (harvest) order
    expect(questions[1].options).toEqual(["United States", "Canada"]) // verbatim, never LLM-authored
    expect(questions[2].options).toEqual(["Yes", "No"])
  })

  it("rejects unknown fieldIds and snaps incompatible types to the DOM default", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [
        decision("q999"),
        decision("q2", { type: "long_text" }), // select can't be long_text → snaps to select
        decision("q4", { type: "short_text" }), // textarea → long_text
        decision("q9", { type: "multi_select" }), // checkbox GROUP → multi_select allowed
      ],
    }
    const { questions } = resolveIndexedQuestions(raw, FIELDS)
    expect(questions.map((q) => [q.label, q.type])).toEqual([
      ["Country of residence", "select"],
      ["Why us?", "long_text"],
      ["Preferred locations", "multi_select"],
    ])
  })

  it("native input types win outright over the LLM", () => {
    const fields: HarvestedField[] = [
      { id: "q1", label: "Work email", kind: "text", inputType: "email" },
    ]
    const raw = {
      hasApplicationForm: true,
      questions: [{ fieldId: "q1", include: true, label: "Work email", type: "short_text" }],
    }
    expect(resolveIndexedQuestions(raw, fields).questions[0].type).toBe("email")
  })

  it("LLM may refine a bare text input (e.g. to number)", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [decision("q8", { type: "number" })],
    }
    expect(resolveIndexedQuestions(raw, FIELDS).questions[0].type).toBe("number")
  })

  it("drops consent-noise checkboxes even if the LLM includes them", () => {
    const raw = { hasApplicationForm: true, questions: [decision("q6", { type: "checkbox" })] }
    expect(resolveIndexedQuestions(raw, FIELDS).questions).toEqual([])
  })

  it("keeps a consent-worded RADIO (background check) — filter is checkbox-only", () => {
    const fields: HarvestedField[] = [
      { id: "q1", label: "Do you consent to a background check?", kind: "radio", options: ["Yes", "No"] },
    ]
    const raw = {
      hasApplicationForm: true,
      questions: [
        { fieldId: "q1", include: true, label: "Do you consent to a background check?", type: "radio" },
      ],
    }
    expect(resolveIndexedQuestions(raw, fields).questions).toHaveLength(1)
  })

  it("DOM required:true is never un-set; LLM may set required the DOM missed", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [
        decision("q1", { required: false }), // DOM says required → stays required
        decision("q4", { type: "long_text", required: true }), // DOM silent → LLM upgrades
      ],
    }
    const { questions } = resolveIndexedQuestions(raw, FIELDS)
    expect(questions[0].required).toBe(true)
    expect(questions[1].required).toBe(true)
  })

  it("passes placeholder from the harvest and helpText from the LLM", () => {
    const fields: HarvestedField[] = [
      { id: "q1", label: "LinkedIn", kind: "text", inputType: "url", placeholder: "https://linkedin.com/in/…" },
    ]
    const raw = {
      hasApplicationForm: true,
      questions: [
        { fieldId: "q1", include: true, label: "LinkedIn", type: "url", helpText: "Public profile" },
      ],
    }
    const q = resolveIndexedQuestions(raw, fields).questions[0]
    expect(q.placeholder).toBe("https://linkedin.com/in/…")
    expect(q.helpText).toBe("Public profile")
  })

  it("include:false and unusable replies yield no questions", () => {
    expect(
      resolveIndexedQuestions(
        { hasApplicationForm: false, questions: [decision("q1", { include: false })] },
        FIELDS,
      ).questions,
    ).toEqual([])
    expect(resolveIndexedQuestions("garbage", FIELDS).questions).toEqual([])
  })
})
