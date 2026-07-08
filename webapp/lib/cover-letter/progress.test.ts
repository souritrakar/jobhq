import { describe, expect, it } from "vitest"

import {
  drainEvents,
  encodeEvent,
  isProgressEvent,
  type ProgressEvent,
} from "./progress"

describe("encodeEvent / drainEvents round-trip", () => {
  it("round-trips a sequence of events", () => {
    const events: ProgressEvent[] = [
      { t: "status", phase: "drafting" },
      { t: "status", phase: "reviewing" },
      { t: "letter", text: "Dear Hiring Manager,\n\nHello." },
    ]
    const wire = events.map(encodeEvent).join("")
    const { events: parsed, rest } = drainEvents(wire)
    expect(parsed).toEqual(events)
    expect(rest).toBe("")
  })

  it("preserves newlines inside a letter's text", () => {
    const event: ProgressEvent = { t: "letter", text: "line one\n\nline two" }
    const { events } = drainEvents(encodeEvent(event))
    expect(events).toEqual([event])
  })
})

describe("drainEvents buffering", () => {
  it("holds back a trailing partial line as rest", () => {
    const whole = encodeEvent({ t: "status", phase: "drafting" })
    const partial = '{"t":"letter","text":"unfinished'
    const { events, rest } = drainEvents(whole + partial)
    expect(events).toEqual([{ t: "status", phase: "drafting" }])
    expect(rest).toBe(partial)
  })

  it("completes a split line once its remainder arrives", () => {
    const first = drainEvents('{"t":"status","ph')
    expect(first.events).toEqual([])
    const second = drainEvents(first.rest + 'ase":"reviewing"}\n')
    expect(second.events).toEqual([{ t: "status", phase: "reviewing" }])
    expect(second.rest).toBe("")
  })

  it("skips a corrupt line without dropping valid neighbors", () => {
    const wire =
      encodeEvent({ t: "status", phase: "drafting" }) +
      "not json at all\n" +
      encodeEvent({ t: "error", code: "SAFETY", message: "withheld" })
    const { events } = drainEvents(wire)
    expect(events).toEqual([
      { t: "status", phase: "drafting" },
      { t: "error", code: "SAFETY", message: "withheld" },
    ])
  })
})

describe("isProgressEvent", () => {
  it.each([
    [{ t: "status", phase: "polishing" }, true],
    [{ t: "letter", text: "hi" }, true],
    [{ t: "error", code: "X", message: "y" }, true],
    [{ t: "status", phase: "unknown" }, false],
    [{ t: "letter" }, false],
    [{ t: "error", code: "X" }, false],
    [{ t: "mystery" }, false],
    [null, false],
    ["string", false],
  ])("validates %o as %s", (value, expected) => {
    expect(isProgressEvent(value)).toBe(expected)
  })
})
