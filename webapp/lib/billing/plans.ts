/**
 * Shared source of truth for plan/feature identifiers and pricing-card display copy.
 *
 * Imported by the app (server gate + billing UI) as the one place these ids/prices are named.
 * `autumn.config.ts` intentionally INLINES the same literals rather than importing this file, so the
 * `atmn` CLI can load the config standalone (without Next's tsconfig path aliases) — the two are kept
 * in sync by hand. Autumn owns the actual subscription state; these are only the stable keys + copy.
 */
export const PLAN_IDS = { free: "free", pro: "pro" } as const
export type PlanId = (typeof PLAN_IDS)[keyof typeof PLAN_IDS]

/** The boolean feature granted only by Pro. `check({ featureId: PRO_FEATURE_ID })` is THE gate. */
export const PRO_FEATURE_ID = "pro"

/** Pro base price. Mirrors the literal in autumn.config.ts — keep the two in sync. */
export const PRO_PRICE = { amount: 20, interval: "month" } as const

/** Display copy for the /dashboard/billing pricing cards. */
export const PLAN_META: Record<PlanId, { name: string; blurb: string; features: string[] }> = {
  free: {
    name: "Free",
    blurb: "Everything you need to save and track your job search.",
    features: ["Save jobs from anywhere", "Track applications & deadlines", "AI cover letters & drafts"],
  },
  pro: {
    name: "Pro",
    blurb: "For power users who want the most out of jobhq.",
    features: ["Everything in Free", "Priority support", "Early access to new features"],
  },
}
