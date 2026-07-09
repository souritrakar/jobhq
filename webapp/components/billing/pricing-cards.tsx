"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCustomer } from "autumn-js/react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PLAN_IDS, PLAN_META, PRO_PRICE, type PlanId } from "@/lib/billing/plans"

/**
 * The Free/Pro pricing table. Upgrades go through Stripe Checkout via Autumn's `attach`; Pro users
 * manage/cancel through the Stripe billing portal. `serverPlan` is the authoritative SSR value used
 * for first paint; once the client `useCustomer()` hydrates we prefer its (focus-refreshed) value so
 * other tabs and post-checkout returns reflect changes without a hard reload.
 */
export function PricingCards({ serverPlan }: { serverPlan: PlanId }) {
  const router = useRouter()
  // `AutumnProvider` sets `refetchOnWindowFocus: false` on its QueryClient by default; opt back in
  // here so a tab left open self-corrects when the user refocuses it after upgrading/cancelling in
  // another tab (see docs/BILLING.md "Other tabs").
  const { data, attach, openCustomerPortal, refetch } = useCustomer({
    queryOptions: { refetchOnWindowFocus: true },
  })
  const [busy, setBusy] = useState(false)

  // Client-derived plan: does an active, non-add-on subscription reference the Pro plan? (No trials
  // are configured, so the SDK's CustomerStatus enum never emits "trialing" — a scheduled-cancel Pro
  // stays "active" until period end, which is exactly what we want to treat as Pro here.)
  const clientIsPro = data?.subscriptions?.some(
    (s) => s.planId === PLAN_IDS.pro && s.status === "active",
  )
  // Trust the client only once its data has actually ARRIVED. `isLoading` flips false on both
  // success AND error; on a failed useCustomer() fetch `data` stays undefined, so falling back to
  // `serverPlan` (not "free") keeps a real Pro user from being shown the upgrade CTA. Self-heals on
  // the next focus-refetch. Gating is server-side regardless — this only governs which CTA shows.
  const plan: PlanId = data ? (clientIsPro ? "pro" : "free") : serverPlan

  // Returning from Stripe Checkout (successUrl carries ?checkout=success): refresh BOTH the client
  // cache and the server components (badge) so Pro shows everywhere immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("checkout") === "success") {
      void refetch()
      router.refresh()
      window.history.replaceState({}, "", "/dashboard/billing")
    }
  }, [refetch, router])

  const upgrade = async () => {
    setBusy(true)
    try {
      await attach({
        planId: PLAN_IDS.pro,
        successUrl: `${window.location.origin}/dashboard/billing?checkout=success`,
      })
    } finally {
      setBusy(false)
    }
  }

  const manage = async () => {
    setBusy(true)
    try {
      await openCustomerPortal({ returnUrl: `${window.location.origin}/dashboard/billing` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["free", "pro"] as const).map((id) => {
        const meta = PLAN_META[id]
        const current = plan === id
        return (
          <div
            key={id}
            className={cn(
              "flex flex-col rounded-2xl border p-5",
              id === "pro" ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{meta.name}</h2>
              {current && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  Current
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{meta.blurb}</p>
            <p className="mt-3 text-2xl font-semibold text-foreground">
              {id === "pro" ? `$${PRO_PRICE.amount}` : "$0"}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2">
              {meta.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              {id === "pro" ? (
                plan === "pro" ? (
                  <Button variant="outline" className="w-full" onClick={manage} disabled={busy}>
                    Manage plan
                  </Button>
                ) : (
                  <Button className="w-full" onClick={upgrade} disabled={busy}>
                    {busy ? "Redirecting…" : "Upgrade to Pro"}
                  </Button>
                )
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  {plan === "free" ? "Current plan" : "Included"}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
