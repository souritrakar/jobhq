import type { Metadata } from "next"

import { getServerUserId } from "@/lib/auth/current-user"
import { getPlan } from "@/lib/server/billing"
import { PricingCards } from "@/components/billing/pricing-cards"

// Never serve a stale plan from a render cache — a just-upgraded user must see Pro immediately.
export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Billing · jobhq" }

export default async function BillingPage() {
  // getServerUserId redirects to sign-in if unauthenticated; getPlan is the authoritative read.
  const userId = await getServerUserId()
  const plan = await getPlan(userId)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan. You are currently on the{" "}
          <span className="font-medium text-foreground">{plan === "pro" ? "Pro" : "Free"}</span> plan.
        </p>
      </header>
      <PricingCards serverPlan={plan} />
    </div>
  )
}
