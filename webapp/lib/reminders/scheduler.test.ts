import { describe, expect, it, vi, beforeEach } from "vitest"

const publishJSON = vi.fn()
const del = vi.fn()
vi.mock("@upstash/qstash", () => ({
  // Use a real `function` (not an arrow) so vitest 4 lets it be called with `new Client()`.
  Client: vi.fn(function () {
    return { publishJSON, messages: { delete: del } }
  }),
}))
vi.mock("@/lib/env", () => ({
  env: { QSTASH_TOKEN: "tok", APP_URL: "https://app.test" },
}))

beforeEach(() => {
  publishJSON.mockReset()
  del.mockReset()
})

describe("scheduleReminderDelivery", () => {
  it("publishes with notBefore in epoch seconds and returns messageId", async () => {
    publishJSON.mockResolvedValue({ messageId: "m1" })
    const { scheduleReminderDelivery } = await import("./scheduler")
    const fireAt = new Date("2030-01-01T00:00:00.000Z")
    const id = await scheduleReminderDelivery("r1", fireAt)
    expect(id).toBe("m1")
    expect(publishJSON).toHaveBeenCalledWith({
      url: "https://app.test/api/reminders/fire",
      body: { reminderId: "r1" },
      notBefore: Math.floor(fireAt.getTime() / 1000),
    })
  })

  it("swallows delete errors", async () => {
    del.mockRejectedValue(new Error("404"))
    const { cancelScheduledDelivery } = await import("./scheduler")
    await expect(cancelScheduledDelivery("m1")).resolves.toBeUndefined()
  })
})
