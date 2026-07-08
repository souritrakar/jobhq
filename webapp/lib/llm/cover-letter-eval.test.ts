import { describe, expect, it } from "vitest"

import {
  buildEvalMessages,
  EVAL_FLOORS,
  evalModelChain,
  parseEvalVerdict,
  renderGapsForRevise,
} from "./cover-letter-eval"

const job = {
  title: "Graphics Engineer",
  company: "Meshy",
  description: "Build real-time rendering pipelines.",
}

describe("evalModelChain", () => {
  it("puts primary first, then deduped fallbacks", () => {
    expect(evalModelChain("a", "b, c , a")).toEqual(["a", "b", "c"])
  })
})

describe("buildEvalMessages", () => {
  it("embeds the job, resume, instructions, and draft, and the rubric", () => {
    const [system, user] = buildEvalMessages({
      job,
      resumeText: "Shipped a Vulkan renderer.",
      instructions: "Keep it under 250 words.",
      letter: "Dear Hiring Manager, ...",
    })
    expect(system.role).toBe("system")
    expect(system.content).toContain("GROUNDING")
    expect(system.content).toContain("INTEGRITY")
    expect(user.content).toContain("Shipped a Vulkan renderer.")
    expect(user.content).toContain("Keep it under 250 words.")
    expect(user.content).toContain("Dear Hiring Manager, ...")
  })

  it("marks INSTRUCTIONS-relevant '(none)' when absent", () => {
    const [, user] = buildEvalMessages({ job, resumeText: "x", letter: "y" })
    expect(user.content).toContain("(none)")
  })
})

describe("parseEvalVerdict", () => {
  it("parses a clean PASS and computes pass from the floors", () => {
    const raw = [
      "GROUNDING: 5 | ok",
      "TAILORING: 4 | ok",
      "SPECIFICITY: 4 | ok",
      "INSTRUCTIONS: 5 | ok",
      "INTEGRITY: 5 | ok",
      "VERDICT: PASS",
    ].join("\n")
    const v = parseEvalVerdict(raw)
    expect(v.parsed).toBe(true)
    expect(v.pass).toBe(true)
    expect(v.gaps).toEqual([])
    expect(v.scores.GROUNDING).toBe(5)
  })

  it("fails (pass=false) when any dimension is below its floor and collects the gap", () => {
    const raw = [
      "GROUNDING: 2 | Opening invents a metric not in the resume",
      "TAILORING: 4 | ok",
      "SPECIFICITY: 3 | ok",
      "INSTRUCTIONS: 4 | ok",
      "INTEGRITY: 5 | ok",
      "VERDICT: REVISE",
    ].join("\n")
    const v = parseEvalVerdict(raw)
    expect(v.parsed).toBe(true)
    expect(v.pass).toBe(false)
    expect(v.gaps).toEqual(["Grounding: Opening invents a metric not in the resume"])
  })

  it("computes pass strictly from floors, not the model's VERDICT line", () => {
    // Model says PASS but INTEGRITY (floor 5) is 4 → we override to fail.
    const raw = [
      "GROUNDING: 5 | ok",
      "TAILORING: 5 | ok",
      "SPECIFICITY: 5 | ok",
      "INSTRUCTIONS: 5 | ok",
      "INTEGRITY: 4 | slight AI cliché in the closing",
      "VERDICT: PASS",
    ].join("\n")
    const v = parseEvalVerdict(raw)
    expect(v.pass).toBe(false)
    expect(v.gaps).toEqual(["Integrity: slight AI cliché in the closing"])
  })

  it("treats INSTRUCTIONS: NA as a non-blocking auto-pass", () => {
    const raw = [
      "GROUNDING: 4 | ok",
      "TAILORING: 3 | ok",
      "SPECIFICITY: 3 | ok",
      "INSTRUCTIONS: NA | ok",
      "INTEGRITY: 5 | ok",
      "VERDICT: PASS",
    ].join("\n")
    const v = parseEvalVerdict(raw)
    expect(v.parsed).toBe(true)
    expect(v.pass).toBe(true)
    expect(v.scores.INSTRUCTIONS).toBeNull()
  })

  it("fails open (parsed=false) on unparseable output", () => {
    const v = parseEvalVerdict("I think this letter is pretty good overall!")
    expect(v.parsed).toBe(false)
    // parsed=false → the pipeline ships the draft; pass is irrelevant but must not claim a real pass.
    expect(v.pass).toBe(false)
  })

  it("fails open when a required dimension is missing even if others parse", () => {
    const raw = ["GROUNDING: 5 | ok", "TAILORING: 4 | ok", "INTEGRITY: 5 | ok"].join("\n")
    // SPECIFICITY missing → unparseable.
    expect(parseEvalVerdict(raw).parsed).toBe(false)
  })

  it("keeps the floors it grades against", () => {
    expect(EVAL_FLOORS.INTEGRITY).toBe(5)
    expect(EVAL_FLOORS.TAILORING).toBe(3)
  })
})

describe("renderGapsForRevise", () => {
  it("joins gaps into newline-delimited directives", () => {
    expect(renderGapsForRevise(["Grounding: x", "Tailoring: y"])).toBe("Grounding: x\nTailoring: y")
  })
})
