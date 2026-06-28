import { describe, expect, it, vi, beforeEach } from "vitest"

// The reminders/to-do split is enforced purely by the `dueAt` filter on the queries that
// back the global Reminders page and its sidebar badge: a dateless row is a plain to-do and
// must never surface there. listJobReminders, by contrast, backs the per-job To-do panel and
// must keep returning both. These tests pin those query shapes.
const findMany = vi.fn((_args?: { where: Record<string, unknown> }) => Promise.resolve([]))
const count = vi.fn((_args?: { where: Record<string, unknown> }) => Promise.resolve(0))
vi.mock("@/lib/db", () => ({
  prisma: { reminder: { findMany, count } },
}))

beforeEach(() => {
  findMany.mockClear()
  count.mockClear()
})

describe("listReminders (global Reminders feed)", () => {
  it("excludes dateless to-dos — only dated reminders reach the feed", async () => {
    const { listReminders } = await import("./reminders")
    await listReminders("u1")
    const { where } = findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(where.userId).toBe("u1")
    expect(where.dueAt).toEqual({ not: null })
  })
})

describe("countOpenReminders (sidebar badge)", () => {
  it("counts only open, dated reminders — matching what the page shows", async () => {
    const { countOpenReminders } = await import("./reminders")
    await countOpenReminders("u1")
    const { where } = count.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(where.userId).toBe("u1")
    expect(where.done).toBe(false)
    expect(where.dueAt).toEqual({ not: null })
  })
})

describe("listJobReminders (per-job To-do panel)", () => {
  it("returns both to-dos and reminders — NO dueAt filter", async () => {
    const { listJobReminders } = await import("./reminders")
    await listJobReminders("u1", "job1")
    const { where } = findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(where.userId).toBe("u1")
    expect(where.jobId).toBe("job1")
    expect(where.dueAt).toBeUndefined()
  })
})
