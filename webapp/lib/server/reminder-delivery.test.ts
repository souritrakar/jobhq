import { describe, expect, it, vi, beforeEach } from "vitest"

const updateMany = vi.fn()
const findUnique = vi.fn()
const dispatch = vi.fn()
vi.mock("@/lib/db", () => ({
  prisma: { reminder: { updateMany, findUnique } },
}))
vi.mock("@/lib/server/notification-dispatch", () => ({
  dispatchReminderChannels: dispatch,
}))

beforeEach(() => {
  updateMany.mockReset()
  findUnique.mockReset()
  dispatch.mockReset()
})

describe("fireReminder", () => {
  it("claims atomically and dispatches once", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      title: "Ping",
      jobId: null,
      type: "USER",
      user: { id: "u1", email: "a@b.com", notificationPreference: null },
    })
    const { fireReminder } = await import("./reminder-delivery")
    const res = await fireReminder("r1")
    expect(res.delivered).toBe(true)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it("no-ops when the claim is lost (already delivered / done)", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    const { fireReminder } = await import("./reminder-delivery")
    const res = await fireReminder("r1")
    expect(res.delivered).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
