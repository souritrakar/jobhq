import { describe, expect, it } from "vitest"

import {
  cosine,
  defaultValueForType,
  directMatch,
  matchQuestionsToFields,
  normalizeLabel,
  resolveChoice,
} from "./field-matching"

// A deterministic stand-in for the real embedder: maps a text to a one-hot vector by keyword, so the
// intended question↔field pairs score 1 and everything else 0 — no network, fully predictable.
const stubEmbed = async (texts: string[]): Promise<number[][]> =>
  texts.map((t) => {
    const s = t.toLowerCase()
    if (s.includes("email")) return [1, 0, 0]
    if (s.includes("phone")) return [0, 1, 0]
    return [0, 0, 1]
  })

describe("cosine", () => {
  it("is 1 for identical vectors, 0 for orthogonal, 0 for a zero vector", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe("normalizeLabel", () => {
  it("lowercases and strips punctuation, asterisks, and required/optional noise", () => {
    expect(normalizeLabel("First Name *")).toBe("first name")
    expect(normalizeLabel("Email address (required)")).toBe("email address")
    expect(normalizeLabel("Phone / mobile")).toBe("phone mobile")
  })
})

describe("directMatch", () => {
  it("pairs questions to fields with identical normalized labels, one-to-one", () => {
    const out = directMatch(
      [
        { questionId: "q1", label: "First Name" },
        { questionId: "q2", label: "Email *" },
      ],
      [
        { fieldId: "f1", label: "email" },
        { fieldId: "f2", label: "first name" },
      ],
    )
    expect(out).toContainEqual({ questionId: "q1", fieldId: "f2", score: 1 })
    expect(out).toContainEqual({ questionId: "q2", fieldId: "f1", score: 1 })
  })
})

describe("matchQuestionsToFields", () => {
  const questions = [
    { questionId: "q-email", label: "Email address" },
    { questionId: "q-phone", label: "Phone number" },
    { questionId: "q-salary", label: "Salary expectations" },
  ]
  const fields = [
    { fieldId: "f-phone", label: "Phone" },
    { fieldId: "f-email", label: "Email" },
  ]

  it("matches each question to its semantically closest field (one-to-one)", async () => {
    const { matched, unmatchedQuestionIds } = await matchQuestionsToFields(questions, fields, stubEmbed)
    const byQ = Object.fromEntries(matched.map((m) => [m.questionId, m.fieldId]))
    expect(byQ["q-email"]).toBe("f-email")
    expect(byQ["q-phone"]).toBe("f-phone")
    // No field for salary → reported, not mis-filled.
    expect(unmatchedQuestionIds).toEqual(["q-salary"])
    expect(matched.every((m) => m.score >= 0.45)).toBe(true)
  })

  it("reports all questions unmatched when there are no fields", async () => {
    const { matched, unmatchedQuestionIds } = await matchQuestionsToFields(questions, [], stubEmbed)
    expect(matched).toEqual([])
    expect(unmatchedQuestionIds).toEqual(["q-email", "q-phone", "q-salary"])
  })
})

describe("resolveChoice", () => {
  it("resolves a single answer to the page option's value", () => {
    expect(
      resolveChoice("Yes", { type: "radio", options: ["Yes", "No"] }, [
        { value: "1", label: "Yes" },
        { value: "0", label: "No" },
      ]),
    ).toEqual(["1"])
  })

  it("resolves a multi-value answer to each option value", () => {
    expect(
      resolveChoice('["PT","ET"]', { type: "multi_select", options: ["PT", "ET", "CT"] }, [
        { value: "pt", label: "PT" },
        { value: "et", label: "ET" },
        { value: "ct", label: "CT" },
      ]),
    ).toEqual(["pt", "et"])
  })

  it("falls back to containment for minor wording drift", () => {
    expect(
      resolveChoice("Yes", { type: "radio", options: ["Yes"] }, [
        { value: "y", label: "Yes, I am authorized to work" },
      ]),
    ).toEqual(["y"])
  })
})

describe("defaultValueForType", () => {
  it("picks the first option for single choice and a typed stand-in otherwise", () => {
    expect(defaultValueForType({ type: "select", options: ["A", "B"] })).toBe("A")
    expect(defaultValueForType({ type: "number" })).toBe("0")
    expect(defaultValueForType({ type: "short_text" })).toBe("N/A")
    expect(defaultValueForType({ type: "checkbox" })).toBe("true") // consent
    expect(defaultValueForType({ type: "multi_select", options: ["X", "Y"] })).toBe('["X"]')
  })

  it("returns an ISO date for date fields", () => {
    expect(defaultValueForType({ type: "date" })).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
