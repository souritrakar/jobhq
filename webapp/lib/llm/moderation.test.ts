import { describe, expect, it } from "vitest"

import { parseVerdict } from "./moderation"

describe("parseVerdict", () => {
  it("flags an unsafe Nemotron verdict and extracts named categories", () => {
    const r = parseVerdict("User Safety: unsafe\nSafety Categories: Profanity, Harassment")
    expect(r.flagged).toBe(true)
    expect(r.checked).toBe(true)
    expect(r.categories).toEqual(["Profanity", "Harassment"])
  })

  it("flags a slur classified as hate", () => {
    const r = parseVerdict("User Safety: unsafe\nSafety Categories: Profanity, Hate/Identity Hate")
    expect(r.flagged).toBe(true)
    expect(r.categories).toContain("Hate/Identity Hate")
  })

  it("passes a safe Nemotron verdict", () => {
    expect(parseVerdict("User Safety: safe")).toEqual({
      flagged: false,
      categories: [],
      checked: true,
    })
  })

  it("still understands Llama Guard's format (unsafe + S-codes)", () => {
    const r = parseVerdict("unsafe\nS1,S10")
    expect(r.flagged).toBe(true)
    expect(r.categories).toEqual(["S1", "S10"])
  })

  it("understands a bare Llama Guard 'safe'", () => {
    expect(parseVerdict("safe").flagged).toBe(false)
    expect(parseVerdict("safe").checked).toBe(true)
  })

  it("checks 'unsafe' before 'safe' (substring trap)", () => {
    // "unsafe" contains "safe"; the verdict must be flagged, not passed.
    expect(parseVerdict("User Safety: unsafe").flagged).toBe(true)
  })

  it("does not let the label word 'Safety' false-match as 'safe'", () => {
    // A truncated verdict with only the label must NOT be read as a safe pass — it fails open instead.
    expect(parseVerdict("User Safety:").checked).toBe(false)
    expect(parseVerdict("User Safety:").flagged).toBe(false)
  })

  it("fails open on unrecognized / empty output", () => {
    expect(parseVerdict("I think this is fine").checked).toBe(false)
    expect(parseVerdict("").checked).toBe(false)
  })
})
