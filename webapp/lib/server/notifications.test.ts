import { describe, expect, it } from "vitest"
import { toClientNotification } from "./notifications"

describe("toClientNotification", () => {
  it("maps enum + dates to the wire shape", () => {
    const dto = toClientNotification({
      id: "n1",
      kind: "REMINDER_DUE",
      title: "t",
      body: null,
      href: "/x",
      readAt: null,
      createdAt: new Date("2030-01-01T00:00:00Z"),
    } as never)
    expect(dto.kind).toBe("reminder")
    expect(dto.createdAt).toBe("2030-01-01T00:00:00.000Z")
    expect(dto.readAt).toBeUndefined()
  })
})
