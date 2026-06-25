import { describe, expect, it } from "vitest"
import { digestCopy, reminderNotificationCopy } from "./copy"

describe("reminderNotificationCopy", () => {
  it("includes the title and company", () => {
    const c = reminderNotificationCopy({ title: "Follow up", company: "Acme" })
    expect(c.title).toContain("Follow up")
    expect(c.body).toContain("Acme")
    expect(c.title).not.toContain("—")
  })
})

describe("digestCopy", () => {
  it("summarizes the count", () => {
    const c = digestCopy({ count: 3, sample: [{ title: "SWE", company: "Acme" }] })
    expect(c.title).toContain("3")
  })
  it("handles a single job", () => {
    const c = digestCopy({ count: 1, sample: [{ title: "SWE", company: "Acme" }] })
    expect(c.title.toLowerCase()).toContain("job")
  })
})
