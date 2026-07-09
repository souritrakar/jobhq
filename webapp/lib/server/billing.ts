import "server-only"

import { redirect } from "next/navigation"
import { Autumn } from "autumn-js"

import { env } from "@/lib/env"
import { PRO_FEATURE_ID, type PlanId } from "@/lib/billing/plans"

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
const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY })

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
