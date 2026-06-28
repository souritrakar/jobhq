import { beforeEach, describe, expect, it, vi } from "vitest"

import { EMPTY_PROFILE } from "@/components/dashboard/settings/profile-settings"

import { buildAutofillPlan, profilePseudoQuestions } from "./autofill"

// A deterministic stand-in for the real embedder: one-hot by keyword, so intended label pairs score 1
// and unrelated ones 0 — no network, fully predictable. Dims: [name, email, phone, other].
vi.mock("@/lib/llm/embeddings", () => ({
  embed: async (texts: string[]): Promise<number[][]> =>
    texts.map((t) => {
      const s = t.toLowerCase()
      if (s.includes("email")) return [0, 1, 0, 0]
      if (s.includes("phone")) return [0, 0, 1, 0]
      if (s.includes("name")) return [1, 0, 0, 0]
      return [0, 0, 0, 1]
    }),
}))

vi.mock("@/lib/server/jobs", () => ({ getJob: vi.fn() }))
vi.mock("@/lib/server/application-answers", () => ({ getApplicationAnswers: vi.fn() }))
vi.mock("@/lib/server/profile", () => ({ getProfile: vi.fn() }))

import { getApplicationAnswers } from "@/lib/server/application-answers"
import { getJob } from "@/lib/server/jobs"
import { getProfile } from "@/lib/server/profile"

const mockGetJob = vi.mocked(getJob)
const mockGetAnswers = vi.mocked(getApplicationAnswers)
const mockGetProfile = vi.mocked(getProfile)

// getJob returns a rich Prisma job; the service only reads `application.questions`. Cast through unknown
// so the test fixture stays minimal.
function jobWithQuestions(questions: unknown) {
  return { application: { questions } } as unknown as Awaited<ReturnType<typeof getJob>>
}

describe("profilePseudoQuestions", () => {
  it("returns nothing for a null profile", () => {
    expect(profilePseudoQuestions(null)).toEqual([])
  })

  it("returns nothing when every field is empty", () => {
    expect(profilePseudoQuestions({ ...EMPTY_PROFILE })).toEqual([])
  })

  it("skips empty fields and emits only the ones with a value", () => {
    const out = profilePseudoQuestions({ ...EMPTY_PROFILE, email: "a@b.com", phone: "555" })
    const ids = out.map((q) => q.id)
    expect(ids).toContain("profile:email")
    expect(ids).toContain("profile:phone")
    expect(ids).not.toContain("profile:firstName")
    expect(out.find((q) => q.id === "profile:email")?.value).toBe("a@b.com")
  })

  it("synthesizes a full name from first and last when at least one is present", () => {
    const both = profilePseudoQuestions({ ...EMPTY_PROFILE, firstName: "Ada", lastName: "Lovelace" })
    expect(both.find((q) => q.id === "profile:fullName")?.value).toBe("Ada Lovelace")
    // first/last are also emitted individually so split-name forms fill too
    expect(both.find((q) => q.id === "profile:firstName")?.value).toBe("Ada")
    expect(both.find((q) => q.id === "profile:lastName")?.value).toBe("Lovelace")

    const firstOnly = profilePseudoQuestions({ ...EMPTY_PROFILE, firstName: "Ada" })
    expect(firstOnly.find((q) => q.id === "profile:fullName")?.value).toBe("Ada")
  })

  it("does not emit a full name when both first and last are empty", () => {
    const out = profilePseudoQuestions({ ...EMPTY_PROFILE, email: "a@b.com" })
    expect(out.find((q) => q.id === "profile:fullName")).toBeUndefined()
  })

  it("emits EEO self-identification fields when present", () => {
    const out = profilePseudoQuestions({ ...EMPTY_PROFILE, gender: "Female", veteranStatus: "No" })
    const ids = out.map((q) => q.id)
    expect(ids).toContain("profile:gender")
    expect(ids).toContain("profile:veteranStatus")
  })
})

describe("buildAutofillPlan two-layer matching", () => {
  beforeEach(() => {
    mockGetJob.mockReset()
    mockGetAnswers.mockReset()
    mockGetProfile.mockReset()
  })

  it("prefers a saved per-job answer over a profile value for the same field", async () => {
    mockGetJob.mockResolvedValue(jobWithQuestions([{ id: "q1", label: "Email", type: "email" }]))
    mockGetAnswers.mockResolvedValue({ q1: "saved@x.com" })
    mockGetProfile.mockResolvedValue({ ...EMPTY_PROFILE, email: "profile@x.com" })

    const plan = await buildAutofillPlan("u1", "j1", [{ id: "f1", label: "Email", kind: "text" }])

    expect(plan.matched).toHaveLength(1)
    expect(plan.matched[0]).toMatchObject({ fieldId: "f1", value: "saved@x.com", source: "answer" })
  })

  it("fills a field from the profile when no per-job question claims it", async () => {
    mockGetJob.mockResolvedValue(jobWithQuestions([{ id: "q1", label: "Email", type: "email" }]))
    mockGetAnswers.mockResolvedValue({ q1: "saved@x.com" })
    mockGetProfile.mockResolvedValue({ ...EMPTY_PROFILE, email: "saved@x.com", phone: "555-1234" })

    const plan = await buildAutofillPlan("u1", "j1", [
      { id: "f1", label: "Email", kind: "text" },
      { id: "f2", label: "Phone", kind: "text" },
    ])

    const phone = plan.matched.find((m) => m.fieldId === "f2")
    expect(phone).toMatchObject({ value: "555-1234", source: "profile", isDefault: false })
  })

  it("fills from the profile even when the job has no application questions at all", async () => {
    mockGetJob.mockResolvedValue(jobWithQuestions(null))
    mockGetAnswers.mockResolvedValue({})
    mockGetProfile.mockResolvedValue({ ...EMPTY_PROFILE, phone: "555-1234" })

    const plan = await buildAutofillPlan("u1", "j1", [{ id: "f1", label: "Phone", kind: "text" }])

    expect(plan.matched).toHaveLength(1)
    expect(plan.matched[0]).toMatchObject({ fieldId: "f1", value: "555-1234", source: "profile" })
  })

  it("behaves identically to per-job-only when there is no saved profile", async () => {
    mockGetJob.mockResolvedValue(jobWithQuestions([{ id: "q1", label: "Email", type: "email" }]))
    mockGetAnswers.mockResolvedValue({ q1: "saved@x.com" })
    mockGetProfile.mockResolvedValue(null)

    const plan = await buildAutofillPlan("u1", "j1", [
      { id: "f1", label: "Email", kind: "text" },
      { id: "f2", label: "Phone", kind: "text" },
    ])

    expect(plan.matched).toHaveLength(1)
    expect(plan.matched[0]).toMatchObject({ fieldId: "f1", source: "answer" })
  })

  it("does not claim a field from an empty profile field", async () => {
    mockGetJob.mockResolvedValue(jobWithQuestions(null))
    mockGetAnswers.mockResolvedValue({})
    mockGetProfile.mockResolvedValue({ ...EMPTY_PROFILE }) // phone is ""

    const plan = await buildAutofillPlan("u1", "j1", [{ id: "f1", label: "Phone", kind: "text" }])

    expect(plan.matched).toHaveLength(0)
  })

  it("still returns a per-job plan when reading the profile fails", async () => {
    mockGetJob.mockResolvedValue(jobWithQuestions([{ id: "q1", label: "Email", type: "email" }]))
    mockGetAnswers.mockResolvedValue({ q1: "saved@x.com" })
    mockGetProfile.mockRejectedValue(new Error("db down"))

    const plan = await buildAutofillPlan("u1", "j1", [{ id: "f1", label: "Email", kind: "text" }])

    expect(plan.matched).toHaveLength(1)
    expect(plan.matched[0]).toMatchObject({ fieldId: "f1", value: "saved@x.com", source: "answer" })
  })
})
