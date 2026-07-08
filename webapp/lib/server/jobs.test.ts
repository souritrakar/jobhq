import { describe, expect, it, vi, beforeEach } from "vitest"

// Bulk status update touches only prisma.job.updateMany wrapped in prisma.$transaction.
const updateMany = vi.fn()
const $transaction = vi.fn((ops: Promise<unknown>[]) => Promise.all(ops))
vi.mock("@/lib/db", () => ({
  prisma: { job: { updateMany }, $transaction },
}))

beforeEach(() => {
  updateMany.mockReset()
  $transaction.mockClear()
  updateMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve({ count: where.id.in.length }),
  )
})

describe("updateJobStatuses", () => {
  it("groups ids by target status: one write per distinct status", async () => {
    const { updateJobStatuses } = await import("./jobs")
    const res = await updateJobStatuses("u1", [
      { id: "a", status: "APPLIED" },
      { id: "b", status: "APPLIED" },
      { id: "c", status: "INTERVIEWING" },
    ])
    expect(res.count).toBe(3)
    // Two distinct statuses → two updateMany calls, all inside one transaction.
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it("scopes every write to the user (tenant safety)", async () => {
    const { updateJobStatuses } = await import("./jobs")
    await updateJobStatuses("u1", [{ id: "a", status: "OFFER" }])
    for (const [arg] of updateMany.mock.calls) {
      expect(arg.where.userId).toBe("u1")
      expect(arg.where.id.in).toContain("a")
    }
  })

  it("no-ops on an empty change set (no DB round trip)", async () => {
    const { updateJobStatuses } = await import("./jobs")
    const res = await updateJobStatuses("u1", [])
    expect(res.count).toBe(0)
    expect($transaction).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("clears the interview-date revert memory on a manual move", async () => {
    const { updateJobStatuses } = await import("./jobs")
    await updateJobStatuses("u1", [{ id: "a", status: "OFFER" }])
    for (const [arg] of updateMany.mock.calls) {
      expect(arg.data).toMatchObject({ status: "OFFER", statusBeforeInterview: null })
    }
  })
})

describe("interviewStatusTransition", () => {
  const base = { status: "APPLIED" as const, interviewAt: null, statusBeforeInterview: null }
  const someDate = new Date("2030-06-20T09:00:00Z")

  it("promotes to INTERVIEWING and remembers the prior stage when a date is first set", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    expect(interviewStatusTransition(base, { interviewAt: someDate })).toEqual({
      status: "INTERVIEWING",
      statusBeforeInterview: "APPLIED",
    })
  })

  it("does NOT capture a memory when the job is already INTERVIEWING", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    const current = { status: "INTERVIEWING" as const, interviewAt: null, statusBeforeInterview: null }
    expect(interviewStatusTransition(current, { interviewAt: someDate })).toEqual({})
  })

  it("restores the remembered stage when the date is cleared", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    const current = {
      status: "INTERVIEWING" as const,
      interviewAt: someDate,
      statusBeforeInterview: "APPLIED" as const,
    }
    expect(interviewStatusTransition(current, { interviewAt: null })).toEqual({
      status: "APPLIED",
      statusBeforeInterview: null,
    })
  })

  it("leaves status untouched when clearing a date with no remembered stage", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    const current = { status: "INTERVIEWING" as const, interviewAt: someDate, statusBeforeInterview: null }
    expect(interviewStatusTransition(current, { interviewAt: null })).toEqual({})
  })

  it("changes nothing on a date → date reschedule", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    const current = {
      status: "INTERVIEWING" as const,
      interviewAt: someDate,
      statusBeforeInterview: "APPLIED" as const,
    }
    expect(interviewStatusTransition(current, { interviewAt: new Date("2030-07-01T09:00:00Z") })).toEqual({})
  })

  it("forgets the remembered stage on a manual status change", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    const current = {
      status: "INTERVIEWING" as const,
      interviewAt: someDate,
      statusBeforeInterview: "APPLIED" as const,
    }
    expect(interviewStatusTransition(current, { status: "OFFER" })).toEqual({ statusBeforeInterview: null })
  })

  it("no-ops when a patch touches neither status nor the date", async () => {
    const { interviewStatusTransition } = await import("./jobs")
    expect(interviewStatusTransition(base, { notes: "hi" } as never)).toEqual({})
  })
})
