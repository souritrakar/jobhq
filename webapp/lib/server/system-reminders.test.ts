import { describe, expect, it } from "vitest"
import {
  interviewReminderFireAt,
  shouldScheduleInterviewReminder,
  staleCutoff,
} from "./system-reminders"

describe("interviewReminderFireAt", () => {
  it("defaults to 24h before", () => {
    const at = new Date("2030-06-10T15:00:00.000Z")
    const fire = interviewReminderFireAt(at)
    expect(fire.toISOString()).toBe("2030-06-09T15:00:00.000Z")
  })
})

describe("shouldScheduleInterviewReminder", () => {
  const now = new Date("2030-06-10T12:00:00.000Z")

  it("schedules for an upcoming interview", () => {
    expect(shouldScheduleInterviewReminder(new Date("2030-06-20T09:00:00Z"), now)).toBe(true)
  })

  it("still schedules when the interview is inside the 24h lead window (nudge fires now)", () => {
    expect(shouldScheduleInterviewReminder(new Date("2030-06-10T18:00:00Z"), now)).toBe(true)
  })

  it("does NOT schedule for an interview already in the past", () => {
    expect(shouldScheduleInterviewReminder(new Date("2030-06-09T09:00:00Z"), now)).toBe(false)
  })
})

describe("staleCutoff", () => {
  it("subtracts whole days", () => {
    expect(staleCutoff(new Date("2030-01-10T00:00:00Z"), 3).toISOString()).toBe(
      "2030-01-07T00:00:00.000Z",
    )
  })
})
