# Metered Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Enforce Free limits (8 AI generations/month, resets) and Pro-only AI answer drafting, server-side, on top of the existing Autumn billing.

**Architecture:** Two new Autumn features — a metered `generations` (Free 8/mo, Pro unlimited) and a boolean `ai_answer_drafting` (Pro-only). Gates live in the existing shared API routes, keyed on the authenticated `userId`, all server-side with the secret key. Cover-letter generation uses an atomic reserve-then-refund; AI drafting uses a boolean check. Both fail-closed (503) on Autumn outage.

**Tech Stack:** Next.js 16 route handlers, `autumn-js` Node SDK, Vitest.

## Global Constraints

- Autumn is the source of truth; no entitlement state in Neon. All gating server-side with the secret key, keyed on the route's `getUserId(req)`.
- Feature ids: `generations` (metered consumable), `ai_answer_drafting` (boolean). Free generations = **8/month, resets** (`reset: { interval: "month" }`). Pro = `unlimited: true`.
- **Fail-closed** on both gates: Autumn error → `BillingUnavailableError` → **503** (`SERVICE_UNAVAILABLE`). Limit hit / Pro-only → **402** (`PAYMENT_REQUIRED`). Never a misleading "upgrade" on an outage.
- **Reserve-then-refund** for generations (atomic `check({ sendEvent: true })`, refund only when no artifact delivered). Refund is best-effort, never throws.
- Charges only after cheap pre-gates pass (reserve AFTER `prepareCoverLetter`).
- `autumn.config.ts` inlines its own literals (atmn CLI constraint); mirror ids into `lib/billing/plans.ts` constants for app code.
- Run tests with the repo-local binary: `npx vitest run <path>`. Tests at `lib/**/*.test.ts`.
- Full reference: `docs/superpowers/specs/2026-07-09-metered-gating-design.md`.

---

### Task 1: Config, constants, error codes (foundation)

**Files:** Modify `webapp/autumn.config.ts`, `webapp/lib/billing/plans.ts`, `webapp/lib/api/errors.ts`

**Interfaces produced:** `GENERATIONS_FEATURE_ID`, `AI_DRAFTING_FEATURE_ID`, `FREE_GENERATIONS = 8` from `@/lib/billing/plans`; ApiError codes `PAYMENT_REQUIRED` (402) + `SERVICE_UNAVAILABLE` (503).

- [ ] **Step 1: Add features + plan items to `autumn.config.ts`**

Add after the existing `pro` feature:
```ts
export const generations = feature({
  id: "generations",
  name: "AI Generations",
  type: "metered",
  consumable: true,
})

export const aiAnswerDrafting = feature({
  id: "ai_answer_drafting",
  name: "AI Answer Drafting",
  type: "boolean",
})
```
Add to the `free` plan's `items: []`:
```ts
  items: [item({ featureId: generations.id, included: 8, reset: { interval: "month" } })],
```
Add to the `pro` plan's items (keep the existing `pro` flag item):
```ts
  items: [
    item({ featureId: pro.id }),
    item({ featureId: aiAnswerDrafting.id }),
    item({ featureId: generations.id, unlimited: true }),
  ],
```
(Import `item` if not already imported — it is.)

- [ ] **Step 2: Add constants + update PLAN_META in `lib/billing/plans.ts`**

Add:
```ts
export const GENERATIONS_FEATURE_ID = "generations"
export const AI_DRAFTING_FEATURE_ID = "ai_answer_drafting"
/** Free plan's monthly AI-generation allowance. Mirrors the included amount in autumn.config.ts. */
export const FREE_GENERATIONS = 8
```
Update `PLAN_META` bullets to the real model:
```ts
  free: {
    name: "Free",
    blurb: "Everything you need to save and track your job search.",
    features: ["Save & track unlimited jobs", "8 AI generations / month", "Tasks, reminders & notes"],
  },
  pro: {
    name: "Pro",
    blurb: "Unlimited AI for your whole job search.",
    features: ["Unlimited AI generations", "AI answer drafting for applications", "Priority support"],
  },
```

- [ ] **Step 3: Add error codes to `lib/api/errors.ts`**

In the `ApiErrorCode` union add `| "PAYMENT_REQUIRED"` and `| "SERVICE_UNAVAILABLE"`. In `STATUS_BY_CODE` add `PAYMENT_REQUIRED: 402,` and `SERVICE_UNAVAILABLE: 503,`.

- [ ] **Step 4: Typecheck**

Run: `cd webapp && npx tsc --noEmit` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/autumn.config.ts webapp/lib/billing/plans.ts webapp/lib/api/errors.ts
git commit -m "feat(billing): metered generations + ai_answer_drafting features, 402/503 codes"
```

---

### Task 2: Push config to Autumn — MANUAL CHECKPOINT (no commit)

Human-in-the-loop; do not delegate to a subagent.

- [ ] **Step 1:** Confirm the user is authenticated (`cd webapp && npx atmn env` shows their org + Sandbox). If not, ask them to run `! cd webapp && npx atmn login`.
- [ ] **Step 2:** Run `cd webapp && npx atmn push --yes`. Expect it to create/update the `generations` + `ai_answer_drafting` features and update the free/pro plan items. Confirm output.
- [ ] **Step 3:** No commit (remote state).

---

### Task 3: Billing seam — reserve/refund/checkFeature (TDD)

**Files:** Modify `webapp/lib/server/billing.ts`, `webapp/lib/server/billing.test.ts`

**Interfaces produced:** `class BillingUnavailableError`, `reserveGeneration(userId): Promise<{allowed, remaining}>`, `refundGeneration(userId): Promise<void>`, `checkFeature(userId, featureId): Promise<boolean>`.

- [ ] **Step 1: Write failing tests** (append to `billing.test.ts`)

```ts
describe("reserveGeneration", () => {
  it("returns allowed + remaining on the flat shape", async () => {
    check.mockResolvedValueOnce({ allowed: true, balance: { remaining: 7 } })
    expect(await reserveGeneration("u1")).toEqual({ allowed: true, remaining: 7 })
    expect(check).toHaveBeenCalledWith({ customerId: "u1", featureId: "generations", requiredBalance: 1, sendEvent: true })
  })
  it("reads the { data: { allowed, balance } } envelope", async () => {
    check.mockResolvedValueOnce({ data: { allowed: false, balance: { remaining: 0 } } })
    expect(await reserveGeneration("u1")).toEqual({ allowed: false, remaining: 0 })
  })
  it("throws BillingUnavailableError when Autumn throws (fail-closed)", async () => {
    check.mockRejectedValueOnce(new Error("down"))
    await expect(reserveGeneration("u1")).rejects.toBeInstanceOf(BillingUnavailableError)
  })
})

describe("refundGeneration", () => {
  it("tracks a -1 refund", async () => {
    track.mockResolvedValueOnce({})
    await refundGeneration("u1")
    expect(track).toHaveBeenCalledWith({ customerId: "u1", featureId: "generations", value: -1 })
  })
  it("never throws even if track fails", async () => {
    track.mockRejectedValueOnce(new Error("down"))
    await expect(refundGeneration("u1")).resolves.toBeUndefined()
  })
})

describe("checkFeature", () => {
  it("returns true when allowed", async () => {
    check.mockResolvedValueOnce({ allowed: true })
    expect(await checkFeature("u1", "ai_answer_drafting")).toBe(true)
  })
  it("throws BillingUnavailableError on error (fail-closed)", async () => {
    check.mockRejectedValueOnce(new Error("down"))
    await expect(checkFeature("u1", "ai_answer_drafting")).rejects.toBeInstanceOf(BillingUnavailableError)
  })
})
```
Add a `track` mock to the existing `autumn-js` mock: the mocked `Autumn` instance must expose both `check` and `track` (e.g. `{ check, track }`). Update the mock factory and add `const track = vi.fn()` (hoisted like `check`), resetting it in `beforeEach`. Import `reserveGeneration, refundGeneration, checkFeature, BillingUnavailableError`.

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run lib/server/billing.test.ts`) — symbols undefined.

- [ ] **Step 3: Implement** in `lib/server/billing.ts` (see spec §4 for the exact bodies). Import `GENERATIONS_FEATURE_ID` from `@/lib/billing/plans`. `reserveGeneration` calls `autumn.check({ customerId, featureId: GENERATIONS_FEATURE_ID, requiredBalance: 1, sendEvent: true })`, reads `allowed` + `balance.remaining` defensively, throws `BillingUnavailableError` on catch. `refundGeneration` calls `autumn.track({ customerId, featureId: GENERATIONS_FEATURE_ID, value: -1 })` in a try/catch that swallows. `checkFeature` calls `autumn.check({ customerId, featureId })`, defensive `allowed`, throws `BillingUnavailableError` on catch. Export `class BillingUnavailableError extends Error {}`.

- [ ] **Step 4: Run — expect PASS.** Then full suite `npm run test` green.

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/server/billing.ts webapp/lib/server/billing.test.ts
git commit -m "feat(billing): reserveGeneration/refundGeneration/checkFeature seam (fail-closed)"
```

---

### Task 4: Cover-letter pipeline outcome hook + route gate

**Files:** Modify `webapp/lib/server/cover-letter-pipeline.ts` (+ its test), `webapp/app/api/cover-letter/route.ts`

**Interfaces consumed:** `reserveGeneration`, `refundGeneration`, `BillingUnavailableError`.

- [ ] **Step 1: Read the current `coverLetterStream`** to see how it builds the Response body from the async generator (whether it returns a `ReadableStream` or the generator). Identify where the terminal event (`{t:"letter"}` vs `{t:"error"}`) is produced.

- [ ] **Step 2: Add an `onSettled` hook (TDD).** Extend `coverLetterStream` to accept `opts?: { onSettled?: (delivered: boolean) => void }`. Invoke `opts?.onSettled(sawLetter)` exactly once when the stream finishes (`sawLetter = true` iff a `{t:"letter"}` event was emitted). Write a focused test (in `cover-letter-pipeline.test.ts`) that drives the stream with a stubbed deps that (a) delivers a letter → asserts `onSettled(true)`, and (b) yields a terminal error → asserts `onSettled(false)`. Run the test: FAIL → implement → PASS. Keep the change decoupled: the pipeline reports a generic boolean, it knows nothing about billing.

- [ ] **Step 3: Wire the route gate** in `app/api/cover-letter/route.ts` per spec §5: after `prepareCoverLetter`, call `reserveGeneration(userId)` (catch `BillingUnavailableError` → `ApiError("SERVICE_UNAVAILABLE", …)`); if `!allowed` → `ApiError("PAYMENT_REQUIRED", "You've used your 8 free generations this month. Upgrade to Pro for unlimited.")`; pass `{ onSettled: (delivered) => { if (!delivered) void refundGeneration(userId) } }` to `coverLetterStream`.

- [ ] **Step 4: Verify** `npx tsc --noEmit` PASS; `npm run test` green (pipeline + billing tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/server/cover-letter-pipeline.ts webapp/lib/server/cover-letter-pipeline.test.ts webapp/app/api/cover-letter/route.ts
git commit -m "feat(billing): meter cover-letter generation (reserve + refund-on-no-letter)"
```

---

### Task 5: AI answer-drafting Pro gate

**Files:** Modify `webapp/app/api/jobs/[id]/application/draft/route.ts`

- [ ] **Step 1: Add the gate** per spec §6: after `getUserId`/parse, `checkFeature(userId, AI_DRAFTING_FEATURE_ID)` (catch `BillingUnavailableError` → 503); if `!allowed` → `ApiError("PAYMENT_REQUIRED", "AI answer drafting is a Pro feature. Upgrade to draft answers.")`; then `draftApplicationAnswer(...)`. Import `checkFeature`, `BillingUnavailableError` from `@/lib/server/billing`, `AI_DRAFTING_FEATURE_ID` from `@/lib/billing/plans`, `ApiError` from `@/lib/api/errors`.

- [ ] **Step 2: Verify** `npx tsc --noEmit` PASS.

- [ ] **Step 3: Commit**

```bash
git add "webapp/app/api/jobs/[id]/application/draft/route.ts"
git commit -m "feat(billing): gate AI answer drafting to Pro (402 for Free)"
```

---

### Task 6: Frontend — 402/503 handling + remaining count + billing cards

**Files:** the client component(s) that POST `/api/cover-letter` and `/api/jobs/[id]/application/draft`. (`PLAN_META` cards already updated in Task 1.)

- [ ] **Step 1: Locate the client callers.** Grep `components app` for `/api/cover-letter` and `application/draft` fetches. Note how each currently surfaces errors (they read the `{ error: { code, message } }` envelope).

- [ ] **Step 2: Cover-letter client** — on a response with `code === "PAYMENT_REQUIRED"`, render an inline upgrade prompt: the message + a link/button to `/dashboard/billing` ("Upgrade to Pro"). On `code === "SERVICE_UNAVAILABLE"`, show the (retryable) message as a normal error. Add a small "**N of 8 left this month**" indicator sourced from `useCustomer().data?.balances?.generations?.remaining` — render only when the value is a finite number (hide for Pro/unlimited, where it's absent/unlimited).

- [ ] **Step 3: AI-draft client** — on `code === "PAYMENT_REQUIRED"`, show a compact "Pro feature — Upgrade" prompt linking to `/dashboard/billing`; `503` → retryable message.

- [ ] **Step 4: Verify** `npx tsc --noEmit` + `npm run test` green; `npm run lint` clean on touched files.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): upgrade prompts on 402 + generations-remaining indicator"
```

---

### Task 7: Docs + memory

**Files:** `webapp/docs/BILLING.md` (+ memory)

- [ ] **Step 1:** Add a "Metered gating" section to `BILLING.md`: the feature model (generations 8/mo free → unlimited pro; ai_answer_drafting pro-only), the reserve-then-refund pattern, fail-closed (402 vs 503), and the seam API (`reserveGeneration`/`refundGeneration`/`checkFeature`). Note résumé generation joins the `generations` meter when its backend exists; fair-use rate limiting is deferred.
- [ ] **Step 2:** Update memory `billing-autumn.md` with the metering model + `atmn push` note. Commit `git commit -m "docs(billing): document metered gating model + seam"`.

---

### Task 8: E2E verification (manual)

Prereq: Task 2 pushed; app running (`cd webapp && npm run dev`).

- [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint` — green (billing/touched files).
- [ ] Signed-in Free user: generate cover letters; watch "N of 8 left" decrement; at 0 → 402 upgrade CTA, no LLM call. AI-draft a question → 402 upgrade.
- [ ] Force a no-letter outcome (e.g. an instruction the output guard blocks) → confirm the count is refunded.
- [ ] Upgrade to Pro → cover letter + AI draft both unlimited, no counter, no 402.
- [ ] Curl checks: `POST /api/cover-letter` and `/api/jobs/<id>/application/draft` unauth still 401; the gates don't change the auth behavior.

---

## Self-Review

- **Spec coverage:** config §2→T1; codes §3→T1; seam §4→T3; cover-letter gate §5→T4; draft gate §6→T5; frontend §7→T6; reliability §8→T3/T4/T5; docs §9→T7; testing §10→T3/T4/T8; files §11→all. ✓
- **Placeholders:** none — code inlined or precisely referenced to spec sections with exact signatures.
- **Type consistency:** `GENERATIONS_FEATURE_ID`/`AI_DRAFTING_FEATURE_ID`/`FREE_GENERATIONS` (T1) consumed in T3/T4/T5/T6; `BillingUnavailableError`/`reserveGeneration`/`refundGeneration`/`checkFeature` (T3) consumed in T4/T5; error codes (T1) used in T4/T5/T6; `onSettled` signature consistent T4.
