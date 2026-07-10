import "server-only"

import { redirect } from "next/navigation"
import { Autumn } from "autumn-js"

import { env } from "@/lib/env"
import { GENERATIONS_FEATURE_ID, PRO_FEATURE_ID, type PlanId } from "@/lib/billing/plans"

/**
 * The billing seam — the single server-side entry point for subscription state (see docs/BILLING.md).
 *
 * Autumn (on Stripe) is the source of truth; we store nothing about entitlement in Neon. Every call
 * here reads Autumn LIVE, keyed on the caller's authenticated users.id, which is what makes the
 * paywall immune to stale sessions, cross-tab races, and DB tampering. The client `useCustomer()`
 * hook is display-only and must never be trusted for an access decision.
 *
 * Failure policy: Pro checks FAIL CLOSED (an Autumn outage can never *unlock* Pro); plan display
 * FAILS OPEN to Free (an outage must not break the app for paying users either).
 */

// One SDK instance per process. If the key is missing the SDK still constructs; calls then error
// and our fail-closed/open handling treats the user as Free — the app keeps working.
//
// `failOpen: false` disables the SDK's own fail-open behavior for `check` (enabled by default),
// which otherwise swallows network errors/5xxs from Autumn and resolves a synthetic
// `{ allowed: true }` instead of throwing. That would silently unlock Pro for everyone during an
// Autumn outage. With it disabled, those failures propagate as thrown errors, which `isPro`'s
// try/catch below turns into `false` — i.e. actually fail-closed.
const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY, failOpen: false })

/** Authoritative "is this user on Pro?" — fail-closed to false on any error. */
export async function isPro(userId: string): Promise<boolean> {
  try {
    const res = await autumn.check({ customerId: userId, featureId: PRO_FEATURE_ID })
    // The SDK has returned both `{ allowed }` and `{ data: { allowed } }` across versions; read
    // defensively so a shape change degrades to "not Pro" rather than throwing.
    const r = res as { allowed?: boolean; data?: { allowed?: boolean } }
    return Boolean(r?.allowed ?? r?.data?.allowed)
  } catch {
    return false
  }
}

/** The user's current plan for display — fail-open to "free". */
export async function getPlan(userId: string): Promise<PlanId> {
  return (await isPro(userId)) ? "pro" : "free"
}

/** Gate a server route/action on Pro; non-Pro users are rerouted to the billing page. */
export async function requirePro(userId: string): Promise<void> {
  if (!(await isPro(userId))) redirect("/dashboard/billing")
}

/** Thrown when Autumn can't be reached to make a gating decision. Routes map this → 503. */
export class BillingUnavailableError extends Error {}

/**
 * Reserve ONE generation atomically (check + deduct in a single call, so concurrent requests can't
 * both slip past an 8/8 limit). Pro is unlimited → always allowed, nothing deducted.
 * Returns { allowed, remaining }. FAIL-CLOSED: on any Autumn error, throws BillingUnavailableError
 * (the caller must NOT generate) — protects us from runaway cost during an outage.
 */
export async function reserveGeneration(userId: string): Promise<{ allowed: boolean; remaining: number | null }> {
  try {
    const res = await autumn.check({
      customerId: userId,
      featureId: GENERATIONS_FEATURE_ID,
      requiredBalance: 1,
      sendEvent: true,
    })
    const r = res as {
      allowed?: boolean
      data?: { allowed?: boolean; balance?: { remaining?: number } }
      balance?: { remaining?: number }
    }
    const allowed = Boolean(r?.allowed ?? r?.data?.allowed)
    const remaining = r?.balance?.remaining ?? r?.data?.balance?.remaining ?? null
    return { allowed, remaining }
  } catch {
    throw new BillingUnavailableError()
  }
}

/** Best-effort refund of one reserved generation (when no artifact was delivered). Never throws. */
export async function refundGeneration(userId: string): Promise<void> {
  try {
    await autumn.track({ customerId: userId, featureId: GENERATIONS_FEATURE_ID, value: -1 })
  } catch {
    // Swallow — a failed refund must never break the response. Worst case the user loses 1 count.
  }
}

/**
 * Gate a Pro-only capability (boolean feature). Returns true iff allowed. FAIL-CLOSED: on Autumn
 * error, throws BillingUnavailableError (route → 503) rather than granting or denying with a
 * misleading upgrade prompt.
 */
export async function checkFeature(userId: string, featureId: string): Promise<boolean> {
  try {
    const res = await autumn.check({ customerId: userId, featureId })
    const r = res as { allowed?: boolean; data?: { allowed?: boolean } }
    return Boolean(r?.allowed ?? r?.data?.allowed)
  } catch {
    throw new BillingUnavailableError()
  }
}
