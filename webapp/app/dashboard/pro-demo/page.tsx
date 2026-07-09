import type { Metadata } from "next"

import { getServerUserId } from "@/lib/auth/current-user"
import { requirePro } from "@/lib/server/billing"

// Force a live gate on every request — never served from a stale render cache.
export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Pro demo · jobhq" }

/**
 * A deliberately Pro-only page that proves the gate + rerouting works end to end: non-Pro users are
 * redirected to /dashboard/billing by `requirePro` before any content renders. It gates nothing real
 * — it exists so the machinery is demonstrable before we decide which capabilities become Pro-only.
 */
export default async function ProDemoPage() {
  const userId = await getServerUserId()
  await requirePro(userId) // redirects non-Pro users to /dashboard/billing

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Pro-only area ✨</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        If you can read this, the server confirmed you are on Pro. Free users never reach this page —
        they are rerouted to billing.
      </p>
    </div>
  )
}
