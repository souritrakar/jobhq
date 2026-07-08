import { describe, expect, it } from "vitest"

import { buildReviseMessages, reviseModelChain } from "./cover-letter-revise"

const job = {
  title: "Graphics Engineer",
  company: "Meshy",
  description: "Build real-time rendering pipelines.",
}

describe("reviseModelChain", () => {
  it("puts primary first, then deduped fallbacks", () => {
    expect(reviseModelChain("haiku", "glm, lite , haiku")).toEqual(["haiku", "glm", "lite"])
  })
})

describe("buildReviseMessages", () => {
  const messages = buildReviseMessages({
    job,
    resumeText: "Shipped a Vulkan renderer at Pixar.",
    instructions: "Formal tone.",
    currentLetter: "Dear Hiring Manager,\n\nI love rendering.",
    revision: "Grounding: name the Vulkan work from the resume; cut the generic opening.",
  })
  const [system, user] = messages

  it("inherits the full generation policy (output contract, no-invention, scope & secrecy)", () => {
    expect(system.role).toBe("system")
    expect(system.content).toContain("OUTPUT CONTRACT")
    expect(system.content).toContain("SCOPE & SECRECY")
    expect(system.content).toMatch(/no unprompted invention/i)
  })

  it("adds the revise task addendum reframing the job as improvement", () => {
    expect(system.content).toContain("REVISION TASK")
    expect(system.content).toMatch(/improving an EXISTING cover letter/i)
    // The no-invention rule is restated in the revise context, so 'improve grounding' can't fabricate.
    expect(system.content).toMatch(/never inventing employers/i)
  })

  it("embeds the current letter and the requested changes", () => {
    expect(user.content).toContain("I love rendering.")
    expect(user.content).toContain("name the Vulkan work from the resume")
    expect(user.content).toContain("Shipped a Vulkan renderer at Pixar.")
    expect(user.content).toContain("Formal tone.")
  })

  it("caches the system prompt for reuse", () => {
    expect(system.cache).toBe(true)
  })
})
