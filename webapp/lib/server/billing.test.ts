import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the Autumn Node SDK. The constructor returns an object whose `check` we control per test.
// `vi.mock` factories are hoisted above this module's own top-level declarations, so any variable
// they close over must itself be declared inside `vi.hoisted` (plain `const check = vi.fn()` here
// would hit the temporal dead zone when the factory runs).
const { check, track, redirect, autumnCtor } = vi.hoisted(() => ({
  check: vi.fn(),
  track: vi.fn(),
  // requirePro calls next/navigation redirect; make it throw a recognizable sentinel so we can assert.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  // Captures the options object `new Autumn(...)` was constructed with, so tests can assert on it.
  autumnCtor: vi.fn(),
}))
vi.mock("autumn-js", () => ({
  // `new Autumn(...)` requires a constructible implementation — an arrow function throws
  // "is not a constructor" when invoked with `new`, so this must be a `function` expression.
  Autumn: vi.fn().mockImplementation(function (options: unknown) {
    autumnCtor(options)
    return { check, track }
  }),
}))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

import {
  BillingUnavailableError,
  checkFeature,
  getPlan,
  isPro,
  refundGeneration,
  reserveGeneration,
  requirePro,
} from "@/lib/server/billing"

beforeEach(() => {
  check.mockReset()
  track.mockReset()
  redirect.mockClear()
  process.env.AUTUMN_SECRET_KEY = "am_sk_test_x"
})

describe("Autumn SDK construction", () => {
  // Pins the fix for the SDK's default fail-OPEN behavior on `check`: on a network error or 5xx,
  // `autumn-js` resolves a synthetic `{ allowed: true }` instead of throwing unless `failOpen: false`
  // is passed to the constructor. The rejection-based "FAILS CLOSED" test below doesn't exercise that
  // path at all (a thrown rejection behaves the same with or without this option) — only asserting on
  // the constructor args actually pins it, since the fail-open interception happens inside the real
  // SDK's HTTP client, which this test suite mocks out entirely.
  it("disables the SDK's fail-open behavior for check", () => {
    expect(autumnCtor).toHaveBeenCalledWith(expect.objectContaining({ failOpen: false }))
  })
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

describe("reserveGeneration", () => {
  it("returns allowed + remaining on the flat shape", async () => {
    check.mockResolvedValueOnce({ allowed: true, balance: { remaining: 7 } })
    expect(await reserveGeneration("u1")).toEqual({ allowed: true, remaining: 7 })
    expect(check).toHaveBeenCalledWith({
      customerId: "u1",
      featureId: "generations",
      requiredBalance: 1,
      sendEvent: true,
    })
  })
  it("reads the { data: { allowed, balance } } envelope", async () => {
    check.mockResolvedValueOnce({ data: { allowed: false, balance: { remaining: 0 } } })
    expect(await reserveGeneration("u1")).toEqual({ allowed: false, remaining: 0 })
  })
  it("throws BillingUnavailableError when Autumn throws (fail-closed)", async () => {
    check.mockRejectedValueOnce(new Error("down"))
    await expect(reserveGeneration("u1")).rejects.toBeInstanceOf(BillingUnavailableError)
  })
})

describe("refundGeneration", () => {
  it("tracks a -1 refund", async () => {
    track.mockResolvedValueOnce({})
    await refundGeneration("u1")
    expect(track).toHaveBeenCalledWith({ customerId: "u1", featureId: "generations", value: -1 })
  })
  it("never throws even if track fails", async () => {
    track.mockRejectedValueOnce(new Error("down"))
    await expect(refundGeneration("u1")).resolves.toBeUndefined()
  })
})

describe("checkFeature", () => {
  it("returns true when allowed", async () => {
    check.mockResolvedValueOnce({ allowed: true })
    expect(await checkFeature("u1", "ai_answer_drafting")).toBe(true)
  })
  it("throws BillingUnavailableError on error (fail-closed)", async () => {
    check.mockRejectedValueOnce(new Error("down"))
    await expect(checkFeature("u1", "ai_answer_drafting")).rejects.toBeInstanceOf(BillingUnavailableError)
  })
})
