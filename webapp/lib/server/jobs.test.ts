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
})
