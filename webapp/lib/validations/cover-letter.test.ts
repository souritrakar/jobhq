import { describe, expect, it } from "vitest"

import { generateCoverLetterSchema } from "./cover-letter"

describe("generateCoverLetterSchema", () => {
  it("accepts a job + resume (instructions optional)", () => {
    const parsed = generateCoverLetterSchema.parse({ jobId: "job_1", resumeId: "doc_1" })
    expect(parsed).toEqual({ jobId: "job_1", resumeId: "doc_1" })
  })

  it("requires a resume — a resume is now mandatory", () => {
    const result = generateCoverLetterSchema.safeParse({ jobId: "job_1" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "resumeId")).toBe(true)
    }
  })

  it("rejects an empty resume id", () => {
    expect(generateCoverLetterSchema.safeParse({ jobId: "job_1", resumeId: "" }).success).toBe(false)
  })

  it("still requires a job", () => {
    expect(generateCoverLetterSchema.safeParse({ resumeId: "doc_1" }).success).toBe(false)
  })

  it("trims instructions and enforces the length cap", () => {
    const parsed = generateCoverLetterSchema.parse({
      jobId: "job_1",
      resumeId: "doc_1",
      instructions: "  keep it under 250 words  ",
    })
    expect(parsed.instructions).toBe("keep it under 250 words")

    const tooLong = generateCoverLetterSchema.safeParse({
      jobId: "job_1",
      resumeId: "doc_1",
      instructions: "x".repeat(2001),
    })
    expect(tooLong.success).toBe(false)
  })
})
