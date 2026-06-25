import { describe, expect, it } from "vitest"
import { interviewReminderFireAt, staleCutoff } from "./system-reminders"

describe("interviewReminderFireAt", () => {
  it("defaults to 24h before", () => {
    const at = new Date("2030-06-10T15:00:00.000Z")
    const fire = interviewReminderFireAt(at)
    expect(fire.toISOString()).toBe("2030-06-09T15:00:00.000Z")
  })
})

describe("staleCutoff", () => {
  it("subtracts whole days", () => {
    expect(staleCutoff(new Date("2030-01-10T00:00:00Z"), 3).toISOString()).toBe(
      "2030-01-07T00:00:00.000Z",
    )
  })
})
