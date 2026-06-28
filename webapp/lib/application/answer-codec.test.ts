import { describe, expect, it } from "vitest"

import { decodeMultiValue, encodeMultiValue, isMultiValue } from "./answer-codec"

describe("isMultiValue", () => {
  it("is true for checkbox/multi_select WITH options", () => {
    expect(isMultiValue({ type: "checkbox", options: ["A", "B"] })).toBe(true)
    expect(isMultiValue({ type: "multi_select", options: ["A"] })).toBe(true)
  })

  it("is false for a bare consent checkbox (no options)", () => {
    expect(isMultiValue({ type: "checkbox" })).toBe(false)
    expect(isMultiValue({ type: "checkbox", options: [] })).toBe(false)
  })

  it("is false for single-value types", () => {
    expect(isMultiValue({ type: "select", options: ["A"] })).toBe(false)
    expect(isMultiValue({ type: "radio", options: ["A"] })).toBe(false)
    expect(isMultiValue({ type: "short_text" })).toBe(false)
  })
})

describe("decodeMultiValue", () => {
  it("parses a JSON string array", () => {
    expect(decodeMultiValue('["Remote","Hybrid"]')).toEqual(["Remote", "Hybrid"])
  })

  it("returns [] for empty / null", () => {
    expect(decodeMultiValue("")).toEqual([])
    expect(decodeMultiValue(null)).toEqual([])
    expect(decodeMultiValue(undefined)).toEqual([])
  })

  it("tolerates a non-JSON value as a single selection", () => {
    expect(decodeMultiValue("Remote")).toEqual(["Remote"])
  })

  it("drops non-string entries", () => {
    expect(decodeMultiValue("[1,2,\"X\"]")).toEqual(["X"])
  })
})

describe("encodeMultiValue", () => {
  it("encodes selections as a JSON array", () => {
    expect(encodeMultiValue(["Remote", "Hybrid"])).toBe('["Remote","Hybrid"]')
  })

  it("encodes an empty selection as the empty string (clears the answer)", () => {
    expect(encodeMultiValue([])).toBe("")
  })

  it("round-trips with decodeMultiValue", () => {
    const v = ["PT", "ET", "GMT"]
    expect(decodeMultiValue(encodeMultiValue(v))).toEqual(v)
  })
})
