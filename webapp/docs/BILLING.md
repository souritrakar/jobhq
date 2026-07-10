# Billing: Autumn (Free + Pro freemium)

How the web app does subscription billing with **[Autumn](https://useautumn.com)** (an open-source
pricing/billing layer that sits on top of **Stripe**), how it maps onto our Neon Auth identities, and
how gating / routing / the billing UI work.

Read [`AUTH.md`](AUTH.md) first — billing is keyed on the same authenticated `users.id`.

## The one decision everything follows from

**Autumn (on Stripe) is the single source of truth for subscription state. We store nothing about
entitlement in Neon.** There is no `users.plan` column. "Is this user Pro?" is a fact owned by
Stripe/Autumn and read **live** on every gate.

Why this is the right call for a public SaaS paywall:

- **Un-bypassable.** There is no DB field to forge — a compromised or tampered database cannot grant
  Pro. The answer always comes from Autumn, verified against Stripe's payment record.
- **No drift.** The app can never disagree with what Stripe actually billed.
- **No cross-tab / stale-session races.** Nothing writes subscription state into our DB, so there is
  no read-modify-write to race on. The authoritative check is a live, idempotent read; upgrading in
  one tab is reflected in every other tab's *next server render* automatically.

The trade-off (a live Autumn call per gate) is cheap and worth it. If it ever isn't, the upgrade path
is a webhook-fed read-model — see "Deferred" below — but that would be a **display cache**, never the
source of gating truth.

## Concepts (Autumn)

- **Feature** — something you can gate/meter. We have three:
  - **`pro`** (boolean) — the generic "is this a paying customer" flag (badge, `requirePro`, pro-demo).
  - **`generations`** (metered, consumable) — the shared AI-generation meter. Free: **8/month**
    (`reset: { interval: "month" }`); Pro: **unlimited**.
  - **`ai_answer_drafting`** (boolean) — Pro-only AI answer drafting for application questions.
- **Plan** — a pricing tier. `free` (no price, `autoEnable: true` → auto-assigned to every new
  customer, re-activates if Pro is cancelled) and `pro` ($20/mo). Both share `group: "main"` so they
  replace each other on upgrade/downgrade.
- **Customer** — identified by our own id. **`customerId ≡ users.id`.** No extra ids to store.

See **Metered gating** below for how the meters are enforced.

## Where it lives

| Concern | File |
| --- | --- |
| Plan/feature ids + pricing-card copy | `lib/billing/plans.ts` |
| Pricing config (source of truth for plans) | `autumn.config.ts` (repo root of `webapp/`) |
| Server gate (the only trusted decision) | `lib/server/billing.ts` |
| Backend handler (customer identity) | `app/api/autumn/[...all]/route.ts` |
| Client provider | `AutumnProvider` in `app/dashboard/layout.tsx` |
| Plan badge | `components/billing/plan-badge.tsx` |
| Billing page + checkout/manage | `app/dashboard/billing/page.tsx`, `components/billing/pricing-cards.tsx` |
| Pro-gated demo (rerouting proof) | `app/dashboard/pro-demo/page.tsx` |

## The server gate — `lib/server/billing.ts`

The single server entry point. Every call reads Autumn **live**, keyed on the caller's authenticated
`users.id`. The client `useCustomer()` hook is **display-only and must never be trusted** for an
access decision.

- `isPro(userId)` → `boolean`. **Fails CLOSED** (`false`) on any Autumn error — an outage can never
  *unlock* Pro. Reads the `check` result defensively (`{ allowed }` and `{ data: { allowed } }` both
  handled) so an SDK shape change degrades to "not Pro" rather than throwing.
- `getPlan(userId)` → `"free" | "pro"`. **Fails OPEN** to `"free"` — an outage must not break the app
  for paying users either; the worst case is a Pro user briefly sees the Free badge.
- `requirePro(userId)` — `redirect("/dashboard/billing")` when not Pro. Use it to gate a server
  route/action.

## Customer identity — `app/api/autumn/[...all]/route.ts`

`autumnHandler({ identify })` mounts the `/api/autumn/*` endpoints the client hook calls. `identify`
is the **trust boundary**: the Autumn customer id is always the signed-in user's id, read server-side
from the Neon Auth session cookie via `getOptionalSessionUser()` — **never** from the request body or
a client-supplied header. Unauthenticated → no customer. A user can only ever act as themselves.

## Client + UI

- `AutumnProvider` (from `autumn-js/react`) wraps the **dashboard subtree** (in the dashboard layout,
  not root) — the authed surface only. `useCustomer()` on first authed load auto-creates the Autumn
  customer and enables Free.
- **Plan badge** ("Free"/"Pro") in the account menu is SSR'd from `getPlan(user.id)` in the dashboard
  layout (already `dynamic = "force-dynamic"`), so it's correct on first paint and re-reads on every
  navigation.
- **Billing page** `/dashboard/billing` (`force-dynamic`): Free/Pro cards. Upgrade →
  `attach({ planId: "pro", successUrl })` → Stripe Checkout (test card `4242 4242 4242 4242`). Manage
  → `openCustomerPortal({ returnUrl })` (Stripe portal). Buttons disable while in-flight
  (no double-submit).

## Routing & access

| Route | Signed out | Free | Pro |
| --- | --- | --- | --- |
| `/` (landing) | CTA: Log in / Sign up | CTA: Open app | CTA: Open app |
| `/dashboard/*` | → sign-in (`proxy.ts`) | ✅ | ✅ |
| `/dashboard/billing` | → sign-in | ✅ (upgrade) | ✅ (manage) |
| `/dashboard/pro-demo` | → sign-in | **→ `/dashboard/billing`** | ✅ |

Auth is guarded by `proxy.ts` (matches `/dashboard/*`). **Pro** gating is enforced in the page/server
layer via `requirePro()`, co-located with the Autumn read — not in the middleware.

## Upgrade refresh & cross-tab consistency

- **Server is always authoritative and live** — no stored flag to go stale.
- **Auth session ⟂ subscription** — upgrading doesn't mutate the auth cookie, so there is no "stale
  session" for auth; only the client *display* cache can lag.
- **Upgrading tab:** Stripe Checkout returns to `/dashboard/billing?checkout=success` → the page calls
  `refetch()` + `router.refresh()` (and strips the query param) → Pro shows immediately (badge,
  billing page, gated routes). Upgrades are immediate in Autumn.
- **Other tabs:** any gated server action re-checks live (security is unaffected); for display, the
  `useCustomer()` query refetches on window focus, so refocusing a stale tab corrects it. On a failed
  `useCustomer()` fetch the cards fall back to the SSR `serverPlan` (not "free"), so a Pro user is
  never shown the upgrade CTA due to a transient error.

## Config & ops (`autumn.config.ts` + `atmn` CLI)

Plans/features are defined in code (`webapp/autumn.config.ts`) and pushed to Autumn with the `atmn`
CLI. The config **inlines** the id/price literals (rather than importing `lib/billing/plans.ts`) so
the CLI can load it standalone without Next's tsconfig path aliases — `plans.ts` and the config are
kept in sync by hand.

```bash
cd webapp
npx atmn login     # one-time browser auth (picks org, writes keys to .env)
npx atmn push      # push local config → Autumn sandbox (default)
npx atmn push -p   # push to production (prompts; --yes to skip)
npx atmn pull      # pull remote plans back into autumn.config.ts
```

`AUTUMN_SECRET_KEY` (server-only; validated `.optional()` in `lib/env.ts`) holds the sandbox key.
Stripe test mode is connected inside the Autumn dashboard. The app boots without the key — gates then
fail-closed (everyone is Free), so local non-billing work is unaffected.

## Metered gating

The pricing model, enforced **server-side** at each feature's route seam (keyed on the route's
authenticated `userId`, secret key only; `useCustomer()` on the client is display-only):

| Capability | Free | Pro | Seam |
|---|---|---|---|
| **AI generations** (cover letter; résumé when it exists) | **8 / month** (resets) | unlimited | `/api/cover-letter` |
| **AI answer drafting** (application questions) | blocked | unlimited | `/api/jobs/[id]/application/draft` |
| Extraction, detection, tasks, reminders, notes, context.dev import | unlimited | unlimited | — |

**Seam API** (`lib/server/billing.ts`):
- `reserveGeneration(userId)` → `{ allowed, remaining }`. Atomic **check-and-reserve**
  (`check({ featureId: "generations", requiredBalance: 1, sendEvent: true })`) — deducts up front so
  concurrent requests can't both slip past an 8/8 limit (cost safety). Pro (unlimited) → always
  allowed, no deduction. **Fail-closed:** throws `BillingUnavailableError` on any Autumn error.
- `refundGeneration(userId)` → best-effort `track({ value: -1 })`, **never throws**.
- `checkFeature(userId, featureId)` → boolean; **fail-closed** (throws `BillingUnavailableError`).

**Cover-letter flow** (`app/api/cover-letter/route.ts`): reserve **after** the cheap pre-gates
(`prepareCoverLetter`, so validation/safety failures never charge) and **before** the stream opens.
The pipeline reports a generic outcome via `coverLetterStream(prepared, { onSettled })`; the route
**refunds** when no letter was delivered — including on **client abort** mid-stream (the `onSettled`
hook runs in a `finally` before a guarded `controller.close()`, so a torn-down stream still refunds).

**AI-drafting flow** (`app/api/jobs/[id]/application/draft/route.ts`): `checkFeature(userId,
"ai_answer_drafting")` before the model call.

**Error contract → UI:** a gate returns the standard `{ error: { code, message } }` envelope with
- **`PAYMENT_REQUIRED` (402)** — limit hit / Pro-only → the client shows a distinct **Upgrade** CTA to
  `/dashboard/billing` (non-retryable).
- **`SERVICE_UNAVAILABLE` (503)** — Autumn unreachable → a normal **retryable** error (never a
  misleading "upgrade" for a Pro user during an outage).
The cover-letter UI also shows "**N of 8 left this month**" from `useCustomer().data?.balances?.generations?.remaining` (hidden for Pro/unlimited).

Why reserve-then-refund (not check-then-track): reserving atomically closes the concurrency hole (a
user firing N parallel requests can't all pass an 8/8 gate → protects cost); the refund keeps it fair
when no artifact is produced. A hard crash between reserve and completion may leak 1 count — an
accepted trade for a paywall (errs toward charging, not toward free generations).

**Config push:** the metered `pro` plan is versioned; on a real launch push with
`--plan-intents '{"pro":"create_version"}'` + a migration draft. Sandbox setup used `update_current`.

## Deferred (YAGNI)

- **Fair-usage rate limiting.** The plan limits above are enforced; per-abuse/cost caps beyond them
  (e.g. throttling a heavy Pro user) are a later layer.
- **Résumé generation meter.** `app/dashboard/resume/*` are UI-only today; when a résumé-generation
  backend exists, gate it with the SAME `generations` meter (`reserveGeneration`/`refundGeneration`).
- **Webhook read-model.** If per-request `check()` latency ever matters, mirror Autumn's `billingUpdated`
  webhook into a Neon **display cache** (never the gating source). Verify the webhook signature.
- **Extension billing UI.** The extension shares this backend; server gates already protect it. Its own
  billing surface (and real auth, replacing the dev `x-user-id` seam) come with extension auth.
