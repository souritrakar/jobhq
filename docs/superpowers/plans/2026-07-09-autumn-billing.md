# Autumn Billing (Free + Pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Autumn (on the user's Stripe sandbox) to the webapp's Neon Auth identity so every user is a Free customer, can upgrade to a $20/mo Pro plan via Stripe Checkout, and Pro access is enforced server-side and reflected everywhere in the UI.

**Architecture:** Autumn is the single source of truth for subscription state — nothing is stored in Neon. All gating is server-side via the Autumn secret key keyed on the authenticated `users.id`; the client `useCustomer()` hook is display-only. Plans live in a version-controlled `autumn.config.ts` pushed with `atmn`.

**Tech Stack:** Next.js 16 (App Router, RSC), `autumn-js` (React hooks + Next handler + Node SDK), `atmn` CLI, Neon Auth (Better Auth wrapper), Vitest.

## Global Constraints

- **Source of truth:** Autumn/Stripe. Never persist an entitlement flag in Neon. No `users.plan` column.
- **customerId ≡ `users.id`**, derived server-side from the Neon Auth session (`lib/auth/current-user.ts`) — never from client input.
- **Fail-closed on Pro** (`isPro` → `false` on any Autumn error), **fail-open on core** (core features never call billing).
- **Secret key server-only.** `AUTUMN_SECRET_KEY` must never reach the client/extension bundle.
- **All billing/dashboard reads are `dynamic = "force-dynamic"`** so plan changes are never served stale.
- Feature id and Pro plan id are both the string `"pro"` (distinct namespaces in Autumn). Free plan id is `"free"`.
- Pro price: **$20/month**. Follow existing repo conventions: env vars via `lib/env.ts` zod schema; DB/service logic under `lib/server/*`; module-level doc comments in the house style.
- Run tests with the repo-local binary: `npx vitest run <path>` (NOT a global vitest). Tests live at `lib/**/*.test.ts` (see `vitest.config.ts`).

---

### Task 1: Foundation — deps, env, shared constants, `autumn.config.ts`

**Files:**
- Modify: `webapp/package.json` (add `autumn-js` dep, `atmn` devDep)
- Modify: `webapp/lib/env.ts` (add `AUTUMN_SECRET_KEY`)
- Modify: `webapp/.env.example` (document the key)
- Modify: `webapp/.env` (add the real sandbox key — local, gitignored)
- Create: `webapp/lib/billing/plans.ts` (shared ids + display copy)
- Create: `webapp/autumn.config.ts` (features + plans)

**Interfaces:**
- Produces: `PLAN_IDS = { free: "free", pro: "pro" } as const`, `PRO_FEATURE_ID = "pro"`, `PRO_PRICE = { amount: 20, interval: "month" } as const`, `type PlanId = "free" | "pro"`, `PLAN_META` (display copy for the pricing cards).

- [ ] **Step 1: Install dependencies**

Run (from `webapp/`):
```bash
npm install autumn-js && npm install -D atmn
```
Expected: both added to `package.json`; `npm install` exits 0.

- [ ] **Step 2: Add the env var**

In `webapp/lib/env.ts`, add inside the `z.object({ ... })` schema, next to the other API keys:
```ts
  // Autumn (useautumn.com) billing — freemium Free/Pro on the connected Stripe sandbox.
  // Server-side ONLY: the secret key must never ship in the extension/client bundle. The Autumn
  // customer id is our Neon Auth users.id; subscription state lives in Autumn, not Neon. Optional
  // so the app still boots without billing configured (gates then fail-closed → everyone is Free).
  AUTUMN_SECRET_KEY: z.string().optional(),
```

- [ ] **Step 3: Document the key in `.env.example`**

Append to `webapp/.env.example`:
```bash
# --- Billing (Autumn) ---
# Autumn secret key for the sandbox environment (Autumn dashboard → Developer → API keys).
# Server-only. Subscription state is owned by Autumn/Stripe, never stored in our DB.
AUTUMN_SECRET_KEY=am_sk_test_...
```

- [ ] **Step 4: Put the real key in local `.env`**

Confirm `.env` is gitignored (`git check-ignore webapp/.env` prints the path). Then add to `webapp/.env`:
```bash
AUTUMN_SECRET_KEY=am_sk_test_GwYJBGreGs9y9vbswGrHslvit16mNy1OTFhjcuYMoi
```

- [ ] **Step 5: Create shared plan constants**

Create `webapp/lib/billing/plans.ts`:
```ts
/**
 * Shared source of truth for plan/feature identifiers and pricing-card display copy.
 *
 * Imported by BOTH the pricing config (`autumn.config.ts`) and the app (server gate + billing UI),
 * so an id can never drift between "what Autumn knows" and "what we ask it about". Autumn owns the
 * actual subscription state — these are only the stable string keys and human-facing labels.
 */
export const PLAN_IDS = { free: "free", pro: "pro" } as const
export type PlanId = (typeof PLAN_IDS)[keyof typeof PLAN_IDS]

/** The boolean feature granted only by Pro. `check({ featureId: PRO_FEATURE_ID })` is THE gate. */
export const PRO_FEATURE_ID = "pro"

/** Pro base price. Keep in sync with autumn.config.ts (both read this constant). */
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
```

- [ ] **Step 6: Create `autumn.config.ts`**

Create `webapp/autumn.config.ts`:
```ts
import { feature, item, plan } from "atmn"

// The detection primitive: a boolean flag granted only by the Pro plan. Server code gates on
// `check({ featureId: "pro" })`. Free and Pro grant the SAME real product access today — this flag
// only records "is this a paying customer", so the machinery (checkout, gating, rerouting, UI) is
// in place before we demarcate which capabilities become Pro-only.
export const pro = feature({
  id: "pro",
  name: "Pro",
  type: "boolean",
})

// Free — auto-assigned to every new customer (no price). Same `group` as Pro so the two replace
// each other on upgrade/downgrade, and Free re-activates automatically if Pro is cancelled.
export const free = plan({
  id: "free",
  name: "Free",
  group: "main",
  autoEnable: true,
  items: [],
})

// Pro — $20/mo, grants the `pro` flag.
export const proPlan = plan({
  id: "pro",
  name: "Pro",
  group: "main",
  price: { amount: 20, interval: "month" },
  items: [item({ featureId: pro.id })],
})
```

- [ ] **Step 7: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: PASS (no errors from the new files). If `atmn` types aren't resolved, confirm it installed in Step 1.

- [ ] **Step 8: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/lib/env.ts webapp/.env.example webapp/lib/billing/plans.ts webapp/autumn.config.ts
git commit -m "feat(billing): scaffold Autumn config, env, and shared plan constants"
```
(Do NOT `git add webapp/.env` — it is gitignored and holds the secret.)

---

### Task 2: Push plans to Autumn — MANUAL CHECKPOINT (no commit)

This pushes `autumn.config.ts` to the Autumn **sandbox**. It needs a one-time interactive browser login, so it is a human-in-the-loop step run in the main session — do **not** delegate to a subagent.

**Interfaces:**
- Produces: the `free` and `pro` plans + `pro` feature existing in the Autumn sandbox (a runtime prerequisite for Tasks 3–8 to return real data). Tasks 3–8 can still be *written and unit-tested* before this, but manual E2E (Task 11) requires it.

- [ ] **Step 1: Ask the user to log in (FLAG EXPLICITLY)**

Tell the user verbatim:
> I need you to authorize the Autumn CLI once. Please run this in the session:
> `! cd webapp && npx atmn login`
> It opens a browser, asks you to pick your org, and saves keys to `.env`. Tell me when it's done.

Wait for confirmation before continuing.

- [ ] **Step 2: Push the config to sandbox**

Run: `cd webapp && npx atmn push`
Expected: an interactive diff summary showing `free`, `pro` plans and the `pro` feature will be **created**; confirm. On success it prints the applied changes.
If it errors with an auth/org problem, re-run Step 1.

- [ ] **Step 3: Verify**

Run: `cd webapp && npx atmn pull --help >/dev/null 2>&1; echo ok` then confirm in the Autumn dashboard (Plans tab) that Free (auto-enable) and Pro ($20/mo) exist. No commit (remote state only).

---

### Task 3: Server billing seam `lib/server/billing.ts` (TDD)

**Files:**
- Create: `webapp/lib/server/billing.ts`
- Test: `webapp/lib/server/billing.test.ts`

**Interfaces:**
- Consumes: `PRO_FEATURE_ID`, `PlanId` from `@/lib/billing/plans`.
- Produces:
  - `isPro(userId: string): Promise<boolean>` — authoritative Pro check, **fail-closed**.
  - `getPlan(userId: string): Promise<PlanId>` — `"pro"` if `isPro` else `"free"`, **fail-open** to `"free"`.
  - `requirePro(userId: string): Promise<void>` — redirects to `/dashboard/billing` when not Pro.

- [ ] **Step 1: Write the failing test**

Create `webapp/lib/server/billing.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the Autumn Node SDK. The constructor returns an object whose `check` we control per test.
const check = vi.fn()
vi.mock("autumn-js", () => ({
  Autumn: vi.fn().mockImplementation(() => ({ check })),
}))
// requirePro calls next/navigation redirect; make it throw a recognizable sentinel so we can assert.
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp && npx vitest run lib/server/billing.test.ts`
Expected: FAIL — cannot resolve `@/lib/server/billing`.

- [ ] **Step 3: Write the implementation**

Create `webapp/lib/server/billing.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run lib/server/billing.test.ts`
Expected: PASS (all cases). If `autumn.check` in the installed SDK is typed with a different param name, adjust the `check({ customerId, featureId })` call AND the test's `toHaveBeenCalledWith` together, then re-run.

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/server/billing.ts webapp/lib/server/billing.test.ts
git commit -m "feat(billing): authoritative server gate (isPro fail-closed, getPlan fail-open, requirePro)"
```

---

### Task 4: Autumn backend handler route

**Files:**
- Create: `webapp/app/api/autumn/[...all]/route.ts`

**Interfaces:**
- Consumes: `getOptionalSessionUser` from `@/lib/auth/current-user`.
- Produces: the `/api/autumn/*` endpoints the client `useCustomer()` hook calls. Customer id = session `users.id`.

- [ ] **Step 1: Write the handler**

Create `webapp/app/api/autumn/[...all]/route.ts`:
```ts
import { autumnHandler } from "autumn-js/next"

import { getOptionalSessionUser } from "@/lib/auth/current-user"

/**
 * Autumn's backend endpoints (`/api/autumn/*`), called by the client `useCustomer()` hook.
 *
 * `identify` is the trust boundary: the Autumn customer id is ALWAYS the signed-in user's id, read
 * from the Neon Auth session cookie — never from the request body or a client-supplied header. An
 * unauthenticated request yields no customer, so the hook can't act on anyone's behalf. See
 * docs/BILLING.md and docs/AUTH.md.
 */
export const { GET, POST } = autumnHandler({
  identify: async () => {
    const user = await getOptionalSessionUser()
    if (!user) return { customerId: undefined }
    return {
      customerId: user.id,
      customerData: { name: user.name ?? undefined, email: user.email },
    }
  },
})
```

- [ ] **Step 2: Verify it builds / typechecks**

Run: `cd webapp && npx tsc --noEmit`
Expected: PASS. If `autumnHandler`'s `identify` return type rejects `name: undefined`, change to `name: user.name ?? ""`.

- [ ] **Step 3: Commit**

```bash
git add webapp/app/api/autumn
git commit -m "feat(billing): mount Autumn handler with session-derived customer identity"
```

---

### Task 5: Wire the provider + read the plan in the dashboard layout

**Files:**
- Modify: `webapp/app/dashboard/layout.tsx`
- Modify: `webapp/components/dashboard/dashboard-shell.tsx` (thread `plan` prop)

**Interfaces:**
- Consumes: `getPlan` from `@/lib/server/billing`; `AutumnProvider` from `autumn-js/react`; `PlanId` from `@/lib/billing/plans`.
- Produces: `DashboardShell` accepts a `plan: PlanId` prop and wraps its subtree so descendants can render the badge; the whole dashboard is wrapped in `<AutumnProvider>`.

- [ ] **Step 1: Update the dashboard layout**

In `webapp/app/dashboard/layout.tsx`:
1. Add imports at the top:
```ts
import { AutumnProvider } from "autumn-js/react"
import { getPlan } from "@/lib/server/billing"
```
2. In the component body, add `getPlan(user.id)` to the existing `Promise.all` (so plan is read alongside notifications):
```ts
  const [notifications, unread, openReminders, plan] = await Promise.all([
    listNotifications(user.id, { limit: 20 }),
    unreadCount(user.id),
    countOpenReminders(user.id),
    getPlan(user.id),
  ])
```
3. Wrap the returned `<DashboardShell>` in `<AutumnProvider>` and pass `plan`:
```tsx
  return (
    <AutumnProvider>
      <DashboardShell
        user={{ name: user.name?.trim() || user.email, email: user.email }}
        plan={plan}
        initialNotifications={notifications}
        initialUnread={unread}
        openReminders={openReminders}
      >
        {children}
      </DashboardShell>
    </AutumnProvider>
  )
```
(The layout is already `export const dynamic = "force-dynamic"`, so the plan is re-read on every navigation.)

- [ ] **Step 2: Accept the `plan` prop in the shell and pass it to `UserMenu`**

In `webapp/components/dashboard/dashboard-shell.tsx`:
1. Add the import: `import type { PlanId } from "@/lib/billing/plans"`.
2. Extend the props type where the component's props are declared (the function currently destructures `user`, `initialNotifications`, `initialUnread`, `openReminders`, `children`) — add `plan: PlanId`.
3. Pass it to BOTH `UserMenu` usages (lines ~218 and ~268): change `<UserMenu name={user.name} email={user.email} />` to `<UserMenu name={user.name} email={user.email} plan={plan} />`.

- [ ] **Step 3: Typecheck (UserMenu prop added next task — expect one error here)**

Run: `cd webapp && npx tsc --noEmit`
Expected: a single error that `UserMenu` has no `plan` prop yet — resolved in Task 6. (If you prefer a clean gate, do Task 6 Step 1 before typechecking.)

- [ ] **Step 4: Commit**

```bash
git add webapp/app/dashboard/layout.tsx webapp/components/dashboard/dashboard-shell.tsx
git commit -m "feat(billing): provider + SSR plan read threaded into the dashboard shell"
```

---

### Task 6: Plan badge + UserMenu + Billing nav link

**Files:**
- Create: `webapp/components/billing/plan-badge.tsx`
- Modify: `webapp/components/dashboard/user-menu.tsx`
- Modify: `webapp/components/dashboard/dashboard-shell.tsx` (add Billing to `NAV`)

**Interfaces:**
- Consumes: `PlanId`, `PLAN_META` from `@/lib/billing/plans`.
- Produces: `<PlanBadge plan={PlanId} />`; `UserMenu` gains a required `plan: PlanId` prop and shows the badge + a "Manage plan" link to `/dashboard/billing`.

- [ ] **Step 1: Create the badge**

Create `webapp/components/billing/plan-badge.tsx`:
```tsx
import { cn } from "@/lib/utils"
import { PLAN_META, type PlanId } from "@/lib/billing/plans"

/** A small Free/Pro pill for the account menu. Pro is filled with the brand accent; Free is muted. */
export function PlanBadge({ plan, className }: { plan: PlanId; className?: string }) {
  const isPro = plan === "pro"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        isPro ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        className,
      )}
    >
      {PLAN_META[plan].name}
    </span>
  )
}
```

- [ ] **Step 2: Update `UserMenu`**

In `webapp/components/dashboard/user-menu.tsx`:
1. Add imports:
```ts
import { CreditCard, LogOut, Settings } from "lucide-react"
import { PlanBadge } from "@/components/billing/plan-badge"
import type { PlanId } from "@/lib/billing/plans"
```
(Replace the existing `import { LogOut, Settings } from "lucide-react"` line.)
2. Add `plan` to the props:
```ts
export function UserMenu({
  name,
  email,
  plan,
  className,
}: {
  name: string
  email: string
  plan: PlanId
  className?: string
}) {
```
3. In the header block, render the badge next to the name. Replace the name `<p>` block:
```tsx
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{name}</p>
              <PlanBadge plan={plan} />
            </div>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
```
4. Add a "Manage plan" link directly above the Settings link, inside the `border-t` menu section:
```tsx
          <Link
            href="/dashboard/billing"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <CreditCard className="size-4 opacity-80" />
            Manage plan
          </Link>
```

- [ ] **Step 3: Add Billing to the sidebar nav**

In `webapp/components/dashboard/dashboard-shell.tsx`, add a `CreditCard` import to the existing `lucide-react` import list, and add an entry to the `NAV` array (after Documents, before Settings):
```ts
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
```

- [ ] **Step 4: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: PASS (Task 5's pending error is now resolved).

- [ ] **Step 5: Commit**

```bash
git add webapp/components/billing/plan-badge.tsx webapp/components/dashboard/user-menu.tsx webapp/components/dashboard/dashboard-shell.tsx
git commit -m "feat(billing): Free/Pro plan badge + Manage plan link + Billing nav"
```

---

### Task 7: Billing page + pricing cards (upgrade + manage + return-refresh)

**Files:**
- Create: `webapp/app/dashboard/billing/page.tsx`
- Create: `webapp/components/billing/pricing-cards.tsx`

**Interfaces:**
- Consumes: `getServerUserId` from `@/lib/auth/current-user`; `getPlan` from `@/lib/server/billing`; `PLAN_IDS`, `PLAN_META`, `PRO_PRICE`, `PlanId` from `@/lib/billing/plans`; `useCustomer` from `autumn-js/react`.
- Produces: the `/dashboard/billing` route.

- [ ] **Step 1: Create the server page**

Create `webapp/app/dashboard/billing/page.tsx`:
```tsx
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
```

- [ ] **Step 2: Create the client pricing cards**

Create `webapp/components/billing/pricing-cards.tsx`:
```tsx
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
  const { data, attach, openCustomerPortal, refetch, isLoading } = useCustomer()
  const [busy, setBusy] = useState(false)

  // Client-derived plan: does an active, non-add-on subscription reference the Pro plan?
  const clientIsPro = data?.subscriptions?.some(
    (s) => s.planId === PLAN_IDS.pro && (s.status === "active" || s.status === "trialing"),
  )
  const plan: PlanId = isLoading ? serverPlan : clientIsPro ? "pro" : "free"

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
```

- [ ] **Step 3: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: PASS. If `attach`/`openCustomerPortal` option names differ in the installed SDK, reconcile against `node_modules/autumn-js` types (the hook is documented with `successUrl` and `returnUrl`).

- [ ] **Step 4: Commit**

```bash
git add webapp/app/dashboard/billing webapp/components/billing/pricing-cards.tsx
git commit -m "feat(billing): /dashboard/billing page with Stripe checkout upgrade + portal manage"
```

---

### Task 8: Pro-gated demo route (rerouting proof)

**Files:**
- Create: `webapp/app/dashboard/pro-demo/page.tsx`

**Interfaces:**
- Consumes: `getServerUserId`, `requirePro`.

- [ ] **Step 1: Create the gated page**

Create `webapp/app/dashboard/pro-demo/page.tsx`:
```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add webapp/app/dashboard/pro-demo
git commit -m "feat(billing): Pro-gated demo route proving requirePro rerouting"
```

---

### Task 9: Auth-aware landing CTA

**Files:**
- Modify: `webapp/app/page.tsx`
- Modify: `webapp/components/landing/v6/nav.tsx`
- Modify: `webapp/components/landing/v6/hero.tsx`
- Modify: `webapp/components/landing/v6/closer.tsx`

**Interfaces:**
- Consumes: `getOptionalSessionUser` from `@/lib/auth/current-user`.
- Produces: `<Nav authed>`, `<Hero authed>`, `<Closer authed>` each accept `authed?: boolean` and switch their primary CTA between "Open app" (`/dashboard`) and "Log in" (`/auth/sign-in`) / "Sign up" (`/auth/sign-up`).

- [ ] **Step 1: Read the session in the landing page**

In `webapp/app/page.tsx`:
1. Add `export const dynamic = "force-dynamic"` (the CTA now depends on the session cookie) and imports:
```ts
import { getOptionalSessionUser } from "@/lib/auth/current-user"
```
2. Make `Home` async and compute `authed`, then pass it into the three components:
```tsx
export default async function Home() {
  const authed = Boolean(await getOptionalSessionUser())
  return (
    <>
      {/* ...skip link unchanged... */}
      <Nav authed={authed} />
      <main id="content" className="flex-1">
        <Hero authed={authed} />
        {/* ...unchanged sections... */}
      </main>
      <Closer authed={authed} />
    </>
  )
}
```

- [ ] **Step 2: Switch the nav CTA**

In `webapp/components/landing/v6/nav.tsx`:
1. Change the signature to `export function Nav({ authed = false }: { authed?: boolean })`.
2. Replace the desktop CTA (`<a href="/dashboard">Open the web app</a>`, ~lines 57-65) with:
```tsx
          {authed ? (
            <a href="/dashboard" className={cn("rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground", FOCUS)}>
              Open app
            </a>
          ) : (
            <a href="/auth/sign-in" className={cn("rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground", FOCUS)}>
              Log in
            </a>
          )}
```
3. Replace the mobile CTA (`<a href="/dashboard">Open the web app</a>`, ~lines 113-122) the same way — `authed` → "Open app" `/dashboard`, else "Log in" `/auth/sign-in`, keeping the existing className and `onClick={() => setOpen(false)}`.

- [ ] **Step 3: Switch the hero CTA**

In `webapp/components/landing/v6/hero.tsx`:
1. Change the signature to `export function Hero({ authed = false }: { authed?: boolean })`.
2. Replace the `<a href="/dashboard">Open the web app</a>` (~lines 36-41) with:
```tsx
            <a
              href={authed ? "/dashboard" : "/auth/sign-up"}
              className="rounded-full px-5 py-3 text-sm font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
            >
              {authed ? "Open app" : "Sign up free"}
            </a>
```
(Preserve the exact className already on that anchor — copy it from the current file if it differs.)

- [ ] **Step 4: Switch the closer CTA**

In `webapp/components/landing/v6/closer.tsx`:
1. Change the signature to `export function Closer({ authed = false }: { authed?: boolean })`.
2. Replace the `<a href="/dashboard">Open the web app</a>` (~lines 22-26) with the same `authed ? ("/dashboard","Open app") : ("/auth/sign-up","Sign up free")` pattern, preserving the existing className.

- [ ] **Step 5: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp/app/page.tsx webapp/components/landing/v6/nav.tsx webapp/components/landing/v6/hero.tsx webapp/components/landing/v6/closer.tsx
git commit -m "feat(landing): auth-aware primary CTA (Open app vs Log in / Sign up)"
```

---

### Task 10: Documentation + memory

**Files:**
- Create: `webapp/docs/BILLING.md`
- Modify: `webapp/docs/BACKEND.md` (one-line pointer to BILLING.md, if it has an index/section list)

- [ ] **Step 1: Write `webapp/docs/BILLING.md`**

Create it covering: the source-of-truth decision (Autumn, not Neon) and why; `customerId ≡ users.id`; the fail-closed/fail-open policy; the `lib/server/billing.ts` seam API (`isPro`/`getPlan`/`requirePro`); the handler trust boundary; where the config lives and how to push (`npx atmn login` then `npx atmn push`, `-p` for prod); the routing/access matrix; how upgrade refresh + cross-tab consistency work; and the deferred items (webhooks, metering, per-feature Pro demarcation). Keep it in the terse house style of the other `webapp/docs/*.md`.

- [ ] **Step 2: Commit**

```bash
git add webapp/docs/BILLING.md webapp/docs/BACKEND.md
git commit -m "docs(billing): document the Autumn freemium model, gates, and ops"
```

- [ ] **Step 3: Update auto-memory**

Create `/home/s7kar/.claude/projects/-home-s7kar-linkedin-saas-jobtracker/memory/billing-autumn.md` (type: project) summarizing: Autumn freemium (Free auto-enable / Pro $20/mo) on Stripe sandbox; source of truth = Autumn not Neon; server gate `lib/server/billing.ts` (isPro fail-closed); `autumn.config.ts` pushed via `atmn`; billing UI at `/dashboard/billing`; `AUTUMN_SECRET_KEY` env. Add the one-line pointer to `MEMORY.md`.

---

### Task 11: End-to-end verification (manual, main session)

Prerequisites: Task 2 pushed the plans; `AUTUMN_SECRET_KEY` is in `.env`. Use the `running-the-app` skill to start the webapp on :3100 (and the voxglide proxy on :3200 if needed).

- [ ] **Step 1:** Run `cd webapp && npm run test` and `npx tsc --noEmit` and `npm run lint` — all green.
- [ ] **Step 2:** Sign in. Confirm the account menu shows the **Free** badge and a **Billing** nav item exists.
- [ ] **Step 3:** Visit `/dashboard/pro-demo` → you are redirected to `/dashboard/billing`.
- [ ] **Step 4:** On `/dashboard/billing`, click **Upgrade to Pro** → Stripe Checkout. Pay with `4242 4242 4242 4242`, any future expiry/CVC/ZIP.
- [ ] **Step 5:** After redirect back, confirm the page shows **Pro / Current** and the account badge flips to **Pro** (badge update confirms `router.refresh()` picked up the new SSR plan).
- [ ] **Step 6:** Visit `/dashboard/pro-demo` again → it now renders (gate passes).
- [ ] **Step 7:** Open a second tab on the dashboard, then refocus it → badge reflects Pro (focus refetch).
- [ ] **Step 8:** From billing, **Manage plan** → Stripe portal → cancel. Back in the app, confirm the state reflects the change on next load.
- [ ] **Step 9:** Sign out, load `/` → nav shows **Log in**, hero/closer show **Sign up free**. Sign in, reload `/` → they show **Open app**.
- [ ] **Step 10:** Final commit if any fixups were needed during verification.

---

## Self-Review

**Spec coverage:**
- §2 security model → Tasks 3 (fail-closed/open gate), 4 (identify trust boundary), Global Constraints. ✓
- §4 config → Task 1. ✓  §5 server → Tasks 3, 4. ✓  §6 provider → Task 5. ✓
- §7 badge → Tasks 5, 6. ✓  §8 billing UI → Task 7. ✓  §9 landing CTA → Task 9. ✓
- §10 routing matrix → Tasks 7, 8 (+ existing proxy). ✓  §11 refresh/cross-tab → Task 7 (return refetch + router.refresh, TanStack focus refetch) & getPlan liveness. ✓
- §12 file list → Tasks 1–10 (custom provider file dropped in favor of using `AutumnProvider` directly — simpler, YAGNI; noted in Task 5). ✓
- §13 testing → Tasks 3, 11. ✓  §14 manual steps → Task 2 (flagged). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. BILLING.md (Task 10) is described by required contents rather than verbatim prose — acceptable for a docs task.

**Type consistency:** `isPro`/`getPlan`/`requirePro` signatures match across Tasks 3, 5, 7, 8. `PlanId`, `PLAN_IDS`, `PLAN_META`, `PRO_PRICE`, `PRO_FEATURE_ID` defined in Task 1 and consumed consistently. `plan` prop typed `PlanId` through layout → shell → UserMenu → PlanBadge. `authed?: boolean` consistent across Nav/Hero/Closer.
