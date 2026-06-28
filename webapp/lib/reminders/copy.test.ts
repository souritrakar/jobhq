import { describe, expect, it } from "vitest"
import { digestCopy, reminderNotificationCopy } from "./copy"

describe("reminderNotificationCopy", () => {
  it("formats Role @ Company for a job-linked reminder", () => {
    const c = reminderNotificationCopy({ title: "Follow up", role: "Senior Engineer", company: "Acme" })
    expect(c.title).toBe("Follow up")
    expect(c.where).toBe("Senior Engineer @ Acme")
    expect(c.body).toBe("Senior Engineer @ Acme")
  })

  it("uses the company alone when no role is given", () => {
    const c = reminderNotificationCopy({ title: "Follow up", company: "Acme" })
    expect(c.where).toBe("Acme")
  })

  it("has no where line for a standalone reminder", () => {
    const c = reminderNotificationCopy({ title: "Renew passport" })
    expect(c.title).toBe("Renew passport")
    expect(c.where).toBeNull()
    expect(c.body).toBeUndefined()
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
  it("agrees in number: singular 'job that needs'", () => {
    const c = digestCopy({ count: 1, sample: [{ title: "SWE", company: "Acme" }] })
    expect(c.title).toBe("You have 1 job that needs attention")
  })
  it("agrees in number: plural 'jobs that need'", () => {
    const c = digestCopy({ count: 4, sample: [{ title: "SWE", company: "Acme" }] })
    expect(c.title).toBe("You have 4 jobs that need attention")
  })
})
