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

- **Feature** — something you can gate/meter. We have one: a **boolean** feature `pro`, granted only
  by the Pro plan. `check({ featureId: "pro" })` is THE gate.
- **Plan** — a pricing tier. `free` (no price, `autoEnable: true` → auto-assigned to every new
  customer, re-activates if Pro is cancelled) and `pro` ($20/mo). Both share `group: "main"` so they
  replace each other on upgrade/downgrade.
- **Customer** — identified by our own id. **`customerId ≡ users.id`.** No extra ids to store.

Today **Free and Pro grant the same real product access.** The `pro` feature only records "is this a
paying customer" — the machinery (checkout, gating, rerouting, UI) is fully in place so that
demarcating specific Pro-only capabilities later is a config change, not a re-architecture.

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

## Deferred (YAGNI)

- **Per-feature Pro demarcation / metering.** Today Free ≡ Pro in real access. When we cap a capability,
  add a metered feature to `autumn.config.ts` and a `check({ featureId })` at that feature's seam.
- **Webhook read-model.** If per-request `check()` latency ever matters, mirror Autumn's `billingUpdated`
  webhook into a Neon **display cache** (never the gating source). Verify the webhook signature.
- **Extension billing UI.** The extension shares this backend; server gates already protect it. Its own
  billing surface (and real auth, replacing the dev `x-user-id` seam) come with extension auth.
