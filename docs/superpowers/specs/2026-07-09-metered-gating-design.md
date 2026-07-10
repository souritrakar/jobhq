# Metered Gating (Free limits + Pro-only features) — Design Spec

- **Date:** 2026-07-09
- **Status:** Approved design → implement
- **Builds on:** `2026-07-09-autumn-billing-design.md` (the Free/Pro billing plumbing). This adds the first **real metered/gated features** on top of it.

---

## 1. Goal

Enforce the confirmed pricing model server-side, reliably and simply:

| Capability | Free | Pro |
|---|---|---|
| **AI generations** (cover letter now; résumé when its backend exists) | **8 / month** (resets monthly) | **unlimited** |
| **AI answer drafting** (application questions) | **blocked** (Pro-only) | **unlimited** |
| Extension extraction & application detection, tasks, reminders, notes, context.dev import | unlimited | unlimited |

"Fair-usage" rate limiting (abuse/cost caps beyond these plan limits) is **explicitly deferred** — a later layer.

Non-goals: résumé-generation gating has **no backend to attach to yet** (`app/dashboard/resume/*` are UI-only); the `generations` meter is designed to cover it, but only the cover-letter seam is wired today. No rate limiting. No per-job dedup (counting is **per generation**).

---

## 2. Autumn config — `webapp/autumn.config.ts`

Add two features and grant them per plan. Keep the existing boolean `pro`.

```ts
// Metered: résumé + cover-letter generations. ONE shared meter across webapp + extension + future
// résumé generation. Free = 8/month (resets); Pro = unlimited.
export const generations = feature({
  id: "generations",
  name: "AI Generations",
  type: "metered",
  consumable: true,
})

// Boolean: AI answer drafting for application questions — Pro only.
export const aiAnswerDrafting = feature({
  id: "ai_answer_drafting",
  name: "AI Answer Drafting",
  type: "boolean",
})

// free plan items:
//   item({ featureId: generations.id, included: 8, reset: { interval: "month" } })
// pro plan items (in addition to the existing pro flag):
//   item({ featureId: pro.id }),
//   item({ featureId: aiAnswerDrafting.id }),
//   item({ featureId: generations.id, unlimited: true }),
```

Mirror the ids into `lib/billing/plans.ts` as constants (`GENERATIONS_FEATURE_ID = "generations"`, `AI_DRAFTING_FEATURE_ID = "ai_answer_drafting"`, `FREE_GENERATIONS = 8`) so the app references never drift; the config keeps inlining its own literals (atmn-CLI constraint, per the base spec).

Requires a manual `npx atmn push` (flag the user).

---

## 3. Error codes — `webapp/lib/api/errors.ts`

Add two codes so gates surface with the right HTTP status and a machine-readable `code` the client can branch on:

```ts
// in ApiErrorCode union:
  | "PAYMENT_REQUIRED"     // 402 — plan limit hit / Pro-only feature → prompt upgrade
  | "SERVICE_UNAVAILABLE"  // 503 — billing check unavailable → retryable
// in STATUS_BY_CODE:
  PAYMENT_REQUIRED: 402,
  SERVICE_UNAVAILABLE: 503,
```

`402` = "you hit your limit / need Pro" (actionable: upgrade). `503` = "we couldn't verify billing, try again" (transient). Keeping them distinct means a Pro user during an Autumn outage never sees a misleading "upgrade" message.

---

## 4. Server billing seam — extend `webapp/lib/server/billing.ts`

All checks/tracks are server-side with the secret key, keyed on the route's authenticated `userId`. A dedicated typed error lets routes map failures to 402 vs 503 cleanly.

```ts
/** Thrown when Autumn can't be reached to make a gating decision. Routes map this → 503. */
export class BillingUnavailableError extends Error {}

/**
 * Reserve ONE generation atomically (check + deduct in a single call, so concurrent requests can't
 * both slip past an 8/8 limit). Pro is unlimited → always allowed, nothing deducted.
 * Returns { allowed, remaining }. FAIL-CLOSED: on any Autumn error, throws BillingUnavailableError
 * (the caller must NOT generate) — protects us from runaway cost during an outage.
 */
export async function reserveGeneration(userId: string): Promise<{ allowed: boolean; remaining: number | null }> {
  try {
    const res = await autumn.check({
      customerId: userId, featureId: GENERATIONS_FEATURE_ID, requiredBalance: 1, sendEvent: true,
    })
    const r = res as { allowed?: boolean; data?: { allowed?: boolean; balance?: { remaining?: number } }; balance?: { remaining?: number } }
    const allowed = Boolean(r?.allowed ?? r?.data?.allowed)
    const remaining = r?.balance?.remaining ?? r?.data?.balance?.remaining ?? null
    return { allowed, remaining }
  } catch {
    throw new BillingUnavailableError()
  }
}

/** Best-effort refund of one reserved generation (when no artifact was delivered). Never throws. */
export async function refundGeneration(userId: string): Promise<void> {
  try {
    await autumn.track({ customerId: userId, featureId: GENERATIONS_FEATURE_ID, value: -1 })
  } catch {
    // Swallow — a failed refund must never break the response. Worst case the user loses 1 count.
  }
}

/**
 * Gate a Pro-only capability (boolean feature). Returns true iff allowed. FAIL-CLOSED: on Autumn
 * error, throws BillingUnavailableError (route → 503) rather than granting or denying with a
 * misleading upgrade prompt.
 */
export async function checkFeature(userId: string, featureId: string): Promise<boolean> {
  try {
    const res = await autumn.check({ customerId: userId, featureId })
    const r = res as { allowed?: boolean; data?: { allowed?: boolean } }
    return Boolean(r?.allowed ?? r?.data?.allowed)
  } catch {
    throw new BillingUnavailableError()
  }
}
```

(The existing `isPro`/`getPlan`/`requirePro` stay unchanged. `checkFeature` generalizes the boolean check for `ai_answer_drafting`.)

Route-level mapping helper (in the routes, or a tiny shared wrapper): catch `BillingUnavailableError` → `throw new ApiError("SERVICE_UNAVAILABLE", "Billing is temporarily unavailable. Please try again.")`.

---

## 5. Gate insertion — cover letter (`app/api/cover-letter/route.ts`)

Reserve **after** `prepareCoverLetter` (so validation/safety failures never charge) and **before** the stream opens. Refund if no letter is delivered.

```ts
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = generateCoverLetterSchema.parse(await req.json())
  const prepared = await prepareCoverLetter(userId, input)   // cheap gates; throws → no charge

  // Meter gate: reserve 1 generation (atomic). 402 if the free limit is spent; 503 if Autumn is down.
  let reservation: { allowed: boolean; remaining: number | null }
  try {
    reservation = await reserveGeneration(userId)
  } catch (e) {
    if (e instanceof BillingUnavailableError)
      throw new ApiError("SERVICE_UNAVAILABLE", "Billing is temporarily unavailable. Please try again.")
    throw e
  }
  if (!reservation.allowed)
    throw new ApiError("PAYMENT_REQUIRED", "You've used your 8 free generations this month. Upgrade to Pro for unlimited.")

  // Refund the reserved unit if the pipeline ends WITHOUT delivering a letter.
  const stream = coverLetterStream(prepared, {
    onSettled: (delivered: boolean) => { if (!delivered) void refundGeneration(userId) },
  })
  return new Response(stream, { headers: { /* unchanged */ } })
})
```

**Refund hook — `coverLetterStream` (`lib/server/cover-letter-pipeline.ts`):** add an optional second arg `opts?: { onSettled?: (delivered: boolean) => void }`. The pipeline already knows its terminal event (it yields exactly one `{t:"letter"}` or `{t:"error"}`); when the underlying async generator completes, call `opts?.onSettled(sawLetter)` exactly once. This keeps billing OUT of the pipeline — it only reports a generic outcome. Existing tests are unaffected (optional arg; default no-op).

Why reserve-first + refund (not check-then-track): reserve-first closes the concurrency hole (a user firing N parallel requests can't all pass an 8/8 gate → protects cost); the refund makes it fair when no artifact is produced. A hard crash between reserve and completion may leak 1 count — acceptable for a paywall (errs toward charging, not toward free generations).

---

## 6. Gate insertion — AI answer drafting (`app/api/jobs/[id]/application/draft/route.ts`)

Pro-only boolean gate, before the model call. Non-streaming, so a plain throw → JSON envelope.

```ts
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const { questionId } = draftAnswerSchema.parse(await req.json())

  let allowed: boolean
  try {
    allowed = await checkFeature(userId, AI_DRAFTING_FEATURE_ID)
  } catch (e) {
    if (e instanceof BillingUnavailableError)
      throw new ApiError("SERVICE_UNAVAILABLE", "Billing is temporarily unavailable. Please try again.")
    throw e
  }
  if (!allowed)
    throw new ApiError("PAYMENT_REQUIRED", "AI answer drafting is a Pro feature. Upgrade to draft answers.")

  const draft = await draftApplicationAnswer(userId, id, questionId)
  return ok(draft)
})
```

Both routes already use `getUserId(req)` (webapp session, or the dev-only `x-user-id` fallback for the extension) — so **the extension is gated by the same backend seam** with no extension changes. (Verify during impl whether the extension calls `/api/cover-letter`; if it has a separate generation path, gate that too. Detection/`score-fields` is unlimited — untouched.)

---

## 7. Frontend UX

Client `useCustomer()` stays display-only. Changes:

- **Cover-letter client** (the component that POSTs `/api/cover-letter`): on a `402` (`code === "PAYMENT_REQUIRED"`) response, show an inline "You've used your 8 free generations this month — **Upgrade to Pro**" with a link to `/dashboard/billing`; on `503`, show the retryable message. Also surface **"N of 8 left this month"** from `useCustomer().data?.balances?.generations?.remaining` (hide for Pro/unlimited).
- **AI-draft client** (per-question draft button): on `402`, show a small "Pro feature — Upgrade" prompt linking to billing.
- **Billing page cards** (`PLAN_META` in `lib/billing/plans.ts`): update the feature bullets to the real model (Free: "8 AI generations / month", "Tasks, reminders & notes"; Pro: "Unlimited AI generations", "AI answer drafting", …).

Keep it minimal — a clear upgrade CTA on the 402 is the must-have; the remaining-count display is a small nicety using data already fetched.

---

## 8. Reliability & security (the spine)

- **Server-side only**, secret key, keyed on the authenticated `userId`. Client never gates.
- **Atomic reserve** (`sendEvent: true`) → concurrency-safe cost control.
- **Fail-closed** on both gates (503 on Autumn outage) — an outage can't unlock Pro or bypass the meter, matching the base spec's `isPro` fail-closed policy and the user's "don't want massive bills" priority.
- **Refund is best-effort** and never breaks the response.
- Charges happen only for real generations (reserve is after all cheap pre-gates).

---

## 9. Docs & config ops

- Update `webapp/docs/BILLING.md` with the metering model, the fail directions, and the seam API (`reserveGeneration`/`refundGeneration`/`checkFeature`). Update the memory `billing-autumn.md`.
- Manual: `npx atmn push` the new features/items to the sandbox (flag the user).

---

## 10. Testing

- **Unit (`lib/server/billing.test.ts`)**: `reserveGeneration` returns `{allowed,remaining}` on `{allowed}`/`{data:{allowed}}` shapes; throws `BillingUnavailableError` when `check` throws (fail-closed); `refundGeneration` swallows track errors; `checkFeature` allowed/blocked + fail-closed. Mock `autumn-js`.
- **Unit (pipeline)**: `coverLetterStream` calls `onSettled(true)` when a letter event is emitted, `onSettled(false)` on a terminal error event.
- **Manual E2E** (after `atmn push`, signed in): Free user → generate cover letters, watch "N of 8 left" decrement; at 0 → 402 upgrade CTA (no LLM call). AI-draft on Free → 402 upgrade. Upgrade to Pro → both unlimited, no counter. Confirm a failed/blocked generation refunds the count.

---

## 11. File-by-file

**Modified**
- `webapp/autumn.config.ts` — add `generations` + `ai_answer_drafting` features and plan items
- `webapp/lib/billing/plans.ts` — feature-id + `FREE_GENERATIONS` constants; `PLAN_META` bullets
- `webapp/lib/api/errors.ts` — `PAYMENT_REQUIRED` (402), `SERVICE_UNAVAILABLE` (503)
- `webapp/lib/server/billing.ts` — `BillingUnavailableError`, `reserveGeneration`, `refundGeneration`, `checkFeature`
- `webapp/lib/server/billing.test.ts` — tests for the above
- `webapp/lib/server/cover-letter-pipeline.ts` — optional `onSettled` outcome hook on `coverLetterStream`
- `webapp/app/api/cover-letter/route.ts` — reserve gate + refund wiring
- `webapp/app/api/jobs/[id]/application/draft/route.ts` — Pro-only draft gate
- Cover-letter client component + AI-draft client component — 402/503 handling + remaining count
- `webapp/docs/BILLING.md` — metering section

**Config push (manual):** `npx atmn push`
