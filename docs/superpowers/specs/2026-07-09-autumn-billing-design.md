# Autumn Billing (Free + Pro) for jobhq — Design Spec

- **Date:** 2026-07-09
- **Status:** Approved design → pending spec review
- **Provider:** [Autumn](https://useautumn.com) (`autumn-js` + `atmn` CLI) on the user's **Stripe sandbox**
- **Scope:** Freemium billing plumbing + Free/Pro plan logic + server-side gating + billing UI + auth-aware routing. Free ≡ Pro in real access for now; this establishes the machinery, not the feature demarcation.

---

## 1. Goals & non-goals

### Goals
1. Wire Autumn to our Neon Auth identity and the connected Stripe sandbox.
2. Define **Free** (auto-enabled, $0) and **Pro** ($20/mo) plans in a version-controlled `autumn.config.ts`.
3. **Server-side gating** that cannot be bypassed, spoofed, or hijacked — the paywall is authoritative on the backend.
4. Show the user's **current plan** in the app UI (no flash).
5. **Billing page**: upgrade to Pro via Stripe Checkout, manage/cancel via the Stripe billing portal.
6. **Prove detection + rerouting** end-to-end with one demo Pro-gated route.
7. **Auth-aware landing CTA**: signed-in vs signed-out users see the right call to action.
8. **Correct refresh & consistency**: upgrading Free→Pro is reflected everywhere; stale client caches and cross-tab races never affect the authoritative decision.

### Non-goals (YAGNI — deliberately deferred)
- Demarcating which specific capabilities are Pro-only, or metering usage. Free and Pro grant the same real access today.
- Storing subscription/entitlement state in Neon as a source of truth (see §2).
- Webhooks, `ai_credits`/credit systems, add-ons, free trials, annual pricing, proration tuning. All are one config/handler change away when needed.
- Extension billing UI (the extension shares the backend; server gates already protect it).

---

## 2. Security model & source of truth (foundational)

**Autumn (on Stripe) is the single source of truth for subscription state. We store no entitlement flag in Neon.**

Rationale — this is the SaaS best practice and directly answers "cannot be abused / hijacked / race conditions":

- **No DB tampering path.** There is no `users.plan` column to forge; being Pro is a fact owned by Stripe/Autumn, verified live.
- **No drift.** The app never disagrees with what Stripe actually billed.
- **No cross-tab DB race.** Because nothing writes subscription state into Neon, there is no read-modify-write to race on. The authoritative check is a live, idempotent read.

Enforcement rules:

1. **All access decisions are server-side**, using the Autumn **secret** key, in `lib/server/billing.ts`. The client `useCustomer()` hook is **display-only** and never trusted for gating.
2. **`customerId` ≡ `users.id`**, derived **server-side** inside the handler's `identify` from the Neon Auth session (`lib/auth/current-user.ts`). Never read from client input, request body, or a header the client controls. A user can therefore only ever act as themselves.
3. **Payment is enforced by Stripe.** `attach({ planId: "pro" })` returns a Stripe Checkout URL; Autumn flips the customer to Pro only after Stripe confirms payment. No client action can fake this.
4. **Fail-closed on Pro, fail-open on core.** If Autumn is unreachable, `isPro()` returns `false` (an outage can never *unlock* Pro). Core app features never call billing, so a billing outage cannot break the product.
5. **Extension / shared API routes** gate on the real authenticated id via the existing seam. The spoofable dev `x-user-id` / `DEV_USER_ID` fallback remains `NODE_ENV !== "production"` only (already enforced in `getUserId`), so it can't be used to spoof Pro in production.

---

## 3. Identity & data model

- Autumn customer id = our Neon Auth `users.id`. No new columns, no new table.
- `identify` also passes `customerData: { name, email }` (read from the same session) so the Autumn dashboard shows human-readable customers and Stripe receipts are addressed correctly.
- First authenticated load of `useCustomer()` auto-creates the Autumn customer and auto-enables Free (`autoEnable: true`).

---

## 4. Plans & features — `webapp/autumn.config.ts`

Code is the source of truth; pushed with `atmn push` (sandbox by default).

```ts
import { feature, item, plan } from "atmn";

// Detection primitive: a boolean flag granted only by Pro.
// `check({ featureId: "pro" })` is the ONE canonical "is this user Pro?" gate.
export const pro = feature({
  id: "pro",
  name: "Pro",
  type: "boolean",
});

// Free — auto-assigned to every new customer, re-activates if Pro is cancelled.
export const free = plan({
  id: "free",
  name: "Free",
  group: "main",
  autoEnable: true,
  items: [],
});

// Pro — $20/mo. Grants the `pro` flag. Same real access as Free today.
export const proPlan = plan({
  id: "pro",
  name: "Pro",
  group: "main",
  price: { amount: 20, interval: "month" },
  items: [item({ featureId: pro.id })],
});
```

Notes:
- Free and Pro share `group: "main"` so they replace each other on upgrade/downgrade and Free re-activates on cancellation.
- The plan id `"pro"` and the feature id `"pro"` are distinct namespaces in Autumn (plan vs feature); both are referenced by name only from our code via shared constants in `lib/billing/plans.ts` (single source for ids + display copy, imported by both the UI and the gate).

---

## 5. Server integration

### 5.1 Env — `lib/env.ts`
Add (server-only, optional so the app still boots without it, matching existing keys):
```ts
AUTUMN_SECRET_KEY: z.string().optional(),
```
Documented in `.env.example`; the real sandbox value goes in local `.env` (gitignored).

### 5.2 Handler — `app/api/autumn/[...all]/route.ts`
```ts
import { autumnHandler } from "autumn-js/next";
import { getOptionalSessionUser } from "@/lib/auth/current-user";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const user = await getOptionalSessionUser(); // reads the Neon Auth cookie; no redirect/throw
    if (!user) return { customerId: undefined };  // unauthenticated → Autumn hook 401s
    return {
      customerId: user.id,
      customerData: { name: user.name ?? undefined, email: user.email },
    };
  },
});
```
Reuses the auth seam instead of re-reading the session — the customer id can only be the signed-in user.

### 5.3 Billing seam — `lib/server/billing.ts` (mirrors `lib/server/*`)
The single server entry point for billing. Wraps the Autumn Node SDK (`new Autumn({ secretKey })`).
- `getSubscription(userId): Promise<{ plan: "free" | "pro"; status: string }>` — live read for SSR display. Fail-open to `"free"` on error.
- `isPro(userId): Promise<boolean>` — `autumn.check({ customer_id, feature_id: "pro" })` → `data.allowed`. **Fail-closed** (`false`) on error.
- `requirePro(userId): Promise<void>` — throws/redirects to `/dashboard/billing` when `!isPro`. Used by server-gated routes/actions.
- Every call hits Autumn **live at request time** — never a cached/stored flag — which is what makes the decision immune to stale sessions and cross-tab races.

---

## 6. Client integration

### 6.1 Provider — `components/providers/autumn-provider.tsx`
`<AutumnProvider>` wrapping the **dashboard layout only** (authed surface; keeps it off the public landing/marketing pages). Configured to **refetch on window focus / visibility change** so a tab that was backgrounded during an upgrade in another tab re-reads state when refocused.

### 6.2 Auto-create
`useCustomer()` on first authed render creates the customer + enables Free.

---

## 7. Subscription status in the UI

- **Plan badge** ("Free" / "Pro") rendered in the dashboard shell (`UserMenu`), fed by an SSR read of `getSubscription()` in `app/dashboard/layout.tsx` (already `dynamic = "force-dynamic"`), so it's correct on first paint with no flash and re-reads on every RSC render / `router.refresh()`.
- The billing page additionally uses the client `useCustomer()` for live, focus-refreshed state.

---

## 8. Billing UI/UX — `/dashboard/billing`

- Server page (`dynamic = "force-dynamic"`, `no-store`) reads `getSubscription()` for the current plan.
- `components/billing/pricing-cards.tsx` (client): two cards (Free / Pro) styled to the Evergreen/Clay design system, current plan marked.
  - **Upgrade** → `attach({ planId: "pro" })` → Stripe Checkout. Button disabled while pending (prevents double-submit). Test card `4242 4242 4242 4242`.
  - **Manage / cancel** (when Pro) → `openBillingPortal()` (Stripe portal).
- **Return handling:** Checkout success returns to `/dashboard/billing?checkout=success`; on mount the page calls `useCustomer().refetch()` **and** `router.refresh()` so both the client cache and the SSR badge reflect Pro immediately (upgrades are immediate in Autumn).
- Add a **"Billing"** entry to the dashboard nav + a "Manage plan" link in `UserMenu`.

---

## 9. Auth-aware landing CTA

Today `components/landing/v6/nav.tsx` (2 CTAs), `v6/hero.tsx`, and `v6/closer.tsx` all link to `/dashboard` with the copy **"Open the web app"** regardless of auth state — a signed-out visitor is silently bounced to sign-in.

Fix (no client flash — `app/page.tsx` is a Server Component):
- `app/page.tsx` reads `getOptionalSessionUser()` and passes an `authed: boolean` prop into `<Nav>`, `<Hero>`, `<Closer>`.
- **Signed in** → primary CTA "Open app" → `/dashboard`.
- **Signed out** → "Log in" → `/auth/sign-in` (and, where two CTAs exist, "Sign up" → `/auth/sign-up`).
- The Chrome-extension CTA is unchanged.

---

## 10. Routing & access matrix

| Route | Signed out | Free | Pro |
|---|---|---|---|
| `/` (landing) | marketing + Log in/Sign up | marketing + Open app | marketing + Open app |
| `/auth/*` | accessible | redirect to `/dashboard` (existing) | redirect to `/dashboard` |
| `/dashboard/*` | redirect to sign-in (proxy.ts) | accessible | accessible |
| `/dashboard/billing` | redirect to sign-in | accessible (shows upgrade) | accessible (shows manage) |
| `/dashboard/pro-demo` (demo gate) | redirect to sign-in | **redirect to `/dashboard/billing`** | accessible |

`proxy.ts` keeps guarding `/dashboard/*` for auth. Pro gating is enforced **in the page/server layer** via `requirePro()`, not in the proxy (keeps the middleware simple and the gate co-located with the Autumn read).

---

## 11. Refresh, cross-tab consistency & race conditions

The guarantees, made explicit:

1. **The server is always authoritative and live.** Every gate (`isPro`/`requirePro`/`getSubscription`) reads Autumn at request time. There is no stored flag to go stale.
2. **Auth session ⟂ subscription.** Upgrading does not mutate the Neon Auth cookie, so there is no "stale session" for auth; the only thing that can lag is the *client display cache*.
3. **Upgrading tab:** returns from Checkout to `?checkout=success` → `refetch()` + `router.refresh()` → Pro reflected immediately (badge, billing page, any gated route).
4. **Other open tabs:**
   - *Security:* unaffected — any gated server action re-checks live.
   - *UX freshness:* `AutumnProvider` refetches on window focus, so refocusing a stale tab updates it. A `BroadcastChannel("autumn")` ping on successful `attach` (other tabs → `refetch()` + `router.refresh()`) is an optional enhancement if we want instant cross-tab updates without a focus.
5. **Downgrade/cancel:** handled in Stripe's portal; Autumn schedules it and the live check reflects the correct state — no DB write, no race.
6. **Double-submit / idempotency:** upgrade button disabled while pending; Stripe/Autumn are idempotent on checkout.
7. **RSC caching:** billing + dashboard reads are `force-dynamic` / `no-store` so a plan change is never served from a stale render cache.

---

## 12. File-by-file change list

**New**
- `webapp/autumn.config.ts` — features + plans
- `webapp/lib/billing/plans.ts` — shared plan/feature ids + display copy
- `webapp/app/api/autumn/[...all]/route.ts` — `autumnHandler`
- `webapp/lib/server/billing.ts` — `getSubscription` / `isPro` / `requirePro`
- `webapp/lib/server/billing.test.ts` — fail-closed / fail-open unit tests (mock Autumn)
- `webapp/components/providers/autumn-provider.tsx` — provider wrapper (focus refetch)
- `webapp/app/dashboard/billing/page.tsx` — billing page
- `webapp/components/billing/pricing-cards.tsx` — upgrade/manage UI
- `webapp/components/billing/plan-badge.tsx` — Free/Pro badge
- `webapp/app/dashboard/pro-demo/page.tsx` — demo Pro-gated route (rerouting proof)
- `webapp/docs/BILLING.md` — documents the model, gates, and manual ops

**Modified**
- `webapp/lib/env.ts` — `AUTUMN_SECRET_KEY`
- `webapp/.env.example` — documented key
- `webapp/app/dashboard/layout.tsx` — wrap in `AutumnProvider`, read `getSubscription`, pass plan → shell
- `webapp/components/dashboard/dashboard-shell.tsx` — accept `plan`, render badge, add Billing nav link
- `webapp/components/dashboard/user-menu.tsx` — badge + "Manage plan" link
- `webapp/app/page.tsx` — read `getOptionalSessionUser` → `authed`
- `webapp/components/landing/v6/nav.tsx`, `v6/hero.tsx`, `v6/closer.tsx` — `authed`-driven CTA
- `webapp/package.json` — `autumn-js` (dep), `atmn` (devDep)

---

## 13. Testing & verification

- **Unit:** `billing.test.ts` — `isPro` returns `false` when Autumn throws (fail-closed); `getSubscription` returns `"free"` on error (fail-open); happy paths mapped correctly.
- **E2E (manual via /run or browse skill):**
  1. Sign in → badge shows **Free**.
  2. `/dashboard/pro-demo` → redirects to `/dashboard/billing`.
  3. Upgrade with `4242 4242 4242 4242` → returns → badge flips to **Pro**, `/dashboard/pro-demo` now renders.
  4. Second tab: refocus → reflects Pro.
  5. Open Stripe portal → cancel → state reflects correctly.
- **Landing:** signed-out shows Log in/Sign up; signed-in shows Open app.

---

## 14. Manual steps required from the user (will be flagged explicitly at the moment each is needed)

1. **`npx atmn login`** — one-time browser auth so the CLI can push config. (Flagged before `atmn push`.)
2. **`npx atmn push`** — push `autumn.config.ts` to the Autumn **sandbox** (I run this; needs step 1 first).
3. **`AUTUMN_SECRET_KEY`** — added to local `.env` from the sandbox key already provided.
4. **Stripe test mode connected in Autumn** — confirmed by the user. ✅
5. **Pro price = $20/mo** — confirmed. ✅

---

## 15. Open questions
None blocking. Cross-tab instant update via `BroadcastChannel` (§11.4) is optional and can be added if focus-refetch proves insufficient in practice.
