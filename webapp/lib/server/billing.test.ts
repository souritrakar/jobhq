import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the Autumn Node SDK. The constructor returns an object whose `check` we control per test.
// `vi.mock` factories are hoisted above this module's own top-level declarations, so any variable
// they close over must itself be declared inside `vi.hoisted` (plain `const check = vi.fn()` here
// would hit the temporal dead zone when the factory runs).
const { check, redirect } = vi.hoisted(() => ({
  check: vi.fn(),
  // requirePro calls next/navigation redirect; make it throw a recognizable sentinel so we can assert.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock("autumn-js", () => ({
  // `new Autumn(...)` requires a constructible implementation — an arrow function throws
  // "is not a constructor" when invoked with `new`, so this must be a `function` expression.
  Autumn: vi.fn().mockImplementation(function () {
    return { check }
  }),
}))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

import { getPlan, isPro, requirePro } from "@/lib/server/billing"

beforeEach(() => {
  check.mockReset()
  redirect.mockClear()
  process.env.AUTUMN_SECRET_KEY = "am_sk_test_x"
})

describe("isPro", () => {
  it("returns true when Autumn reports the pro feature allowed", async () => {
    check.mockResolvedValueOnce({ allowed: true })
    expect(await isPro("u1")).toBe(true)
    expect(check).toHaveBeenCalledWith({ customerId: "u1", featureId: "pro" })
  })

  it("returns false when not allowed", async () => {
    check.mockResolvedValueOnce({ allowed: false })
    expect(await isPro("u1")).toBe(false)
  })

  it("reads the { data: { allowed } } envelope shape too", async () => {
    check.mockResolvedValueOnce({ data: { allowed: true } })
    expect(await isPro("u1")).toBe(true)
  })

  it("FAILS CLOSED to false when Autumn throws", async () => {
    check.mockRejectedValueOnce(new Error("network down"))
    expect(await isPro("u1")).toBe(false)
  })
})

describe("getPlan", () => {
  it("maps pro → 'pro'", async () => {
    check.mockResolvedValueOnce({ allowed: true })
    expect(await getPlan("u1")).toBe("pro")
  })
  it("FAILS OPEN to 'free' on error", async () => {
    check.mockRejectedValueOnce(new Error("down"))
    expect(await getPlan("u1")).toBe("free")
  })
})

describe("requirePro", () => {
  it("redirects non-Pro users to /dashboard/billing", async () => {
    check.mockResolvedValueOnce({ allowed: false })
    await expect(requirePro("u1")).rejects.toThrow("REDIRECT:/dashboard/billing")
  })
  it("does nothing for Pro users", async () => {
    check.mockResolvedValueOnce({ allowed: true })
    await expect(requirePro("u1")).resolves.toBeUndefined()
    expect(redirect).not.toHaveBeenCalled()
  })
})
