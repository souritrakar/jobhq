# Extension cover-letter wiring — design

**Date:** 2026-07-12
**Status:** Approved, ready for implementation

## Goal

Wire the Chrome extension's Resume-tab **"Generate cover letter"** action (currently a stalled
"Soon" no-op) to the real backend, reusing the webapp's cover-letter implementation. Include proper
generating / result / error / upgrade UX, a **download** option, and a **remaining-generations
indicator** — with the free-tier **8/month** limit enforced identically to the webapp.

Non-goal: "Generate tailored resume" stays stalled (no backend exists for it anywhere).

## Constraints that shape the design

- The extension is **no-build plain JS** (no bundler, no React). We cannot import webapp TS/React
  code; we **port** the dependency-free helpers and **mirror** the client state machine.
- Only the **background service worker** holds `host_permissions` for the API
  (`http://localhost:3100/*`). Content scripts cannot fetch the API cross-origin. All backend traffic
  goes `content.js → chrome.runtime.sendMessage → background.js → apiFetch`.
- `chrome.runtime.sendMessage` is **one request → one response** → we use the **round-trip** model
  (approved): background reads the NDJSON stream to completion in the SW and returns the terminal
  result. No Ports, no real-time phase streaming in v1.

## Backend

**Unchanged and fully reused** for generation: `POST /api/cover-letter` already reserves against the
Autumn `generations` meter (8/mo Free, unlimited Pro), returns **402** when spent, **503** on Autumn
outage, and streams NDJSON (`status` events + one terminal `letter`/`error`).

**One new endpoint** for the remaining indicator:

- `GET /api/billing/usage` → `{ data: { plan, generations: { unlimited, remaining, included } } }`.
  Reads Autumn live (no deduction). Backed by a new `getGenerationsUsage(userId)` in
  `lib/server/billing.ts` that does `autumn.check({ featureId: generations, requiredBalance: 1 })`
  **without `sendEvent`** (a peek, never a deduct) and reports `unlimited` for Pro. Fail-open to a
  safe "unknown" (indicator simply hidden) — it must never block generation or the UI.

## Reuse map

| Webapp source | Extension target | How |
| --- | --- | --- |
| `POST /api/cover-letter` | — | Reused as-is (shared backend) |
| `lib/cover-letter/export.ts` | `extension/lib/cover-letter-export.js` | **Port** (strip TS types); dependency-free browser code (Copy, Download .docx, PDF) |
| `lib/cover-letter/progress.ts` `drainEvents` | inline in `background.js` | **Port** the NDJSON line parser to extract the terminal event |
| `cover-letter-generator.tsx` state machine | `extension/ui/modal.js` (Resume pane) | **Mirror** idle/generating/done/error/upgrade + retryable-vs-policy classification in plain JS |

## Message + seam layer

- **background.js** — add two handlers to the central `onMessage` switch:
  - `GENERATE_COVER_LETTER { jobId, resumeId, instructions }` → `generateCoverLetter()`: `apiFetch`
    the endpoint; if `!res.ok`, read `{ error }` envelope → respond `{ ok:false, code, message }`;
    else read the stream, `drain` events, keep the terminal one → respond `{ ok:true, text }` (letter)
    or `{ ok:false, code, message }` (terminal error / stall). Never throws to the caller.
  - `GET_USAGE` → `getUsage()`: `apiFetch("/api/billing/usage")` → `{ ok, usage }`.
- **content.js** — implement two `opts` callbacks passed to `UI.modal.open`, each a
  `sendMessage`-wrapped Promise (mirroring `requestAutofillMatch`):
  - `generateCoverLetter({ resumeId, instructions })` → resolves `{ text }` or **rejects** with a typed
    error `{ code, message }` (so modal.js can branch 402 → upgrade). Uses the drawer's **saved
    jobId**.
  - `getUsage()` → resolves the usage object or `null` on failure.

## UX — Resume pane

Clicking Generate expands an **inline result surface** (drawer is narrow; inline beats a new pane):

- **Gating.** Enabled only when the job is **saved** (endpoint needs a real jobId — same rule as
  saving answers) AND a **backend résumé** is selected (a just-uploaded local file `id` starts with
  `u…` and has no server id yet). Otherwise the button is disabled with an inline reason
  ("Save this job first" / "Select a saved résumé").
- **Generating.** Shimmer skeleton + a caption cycled client-side ("Drafting…" → "Checking quality…"
  → "Polishing…") for texture, since we don't stream real phases.
- **Done.** Editable textarea holding the letter + a toolbar: **Copy · Download .docx · PDF ·
  Regenerate**. (`printPdf` falls back to system font in the drawer context; `.docx` + Copy are the
  primary paths.)
- **402 / Pro-only.** Distinct upgrade card (Sparkles + primary accent, not red error) with
  **Upgrade to Pro** → opens `${DASHBOARD_URL}/dashboard/billing` in a new tab.
- **Error.** Message + "Try again" only when retryable (transient); policy/validation blocks
  (`BAD_REQUEST`/`UNCLEAN`/`SAFETY`) show no retry.
- **Remaining indicator.** A small pill in the Resume pane (near the generate actions): "N of 8 left
  this month". Loaded via `getUsage()` on pane open; hidden entirely for Pro/unlimited or when usage
  is unknown. Refreshed after a successful generation.

## Error / state model (mirrors the webapp)

`idle → generating → { done | error | upgrade }`. Retryable codes = everything except
`{ BAD_REQUEST, UNCLEAN, SAFETY }`. 402 `PAYMENT_REQUIRED` → `upgrade` (never retry). 503 → retryable
error. Abort on pane close / regenerate supersede.

## Testing

- **background.js**: unit-test the NDJSON drain + terminal-event extraction and the `!res.ok`
  envelope mapping (fetch mocked), incl. 402 → `{ ok:false, code:"PAYMENT_REQUIRED" }`.
- **modal.js**: state-machine transitions (generating→done/error/upgrade), gating logic
  (saved job + backend résumé), and toolbar wiring (jsdom, matching the existing extension vitest).
- **cover-letter-export.js**: reuse/port the webapp export behavior; smoke-test `.docx` bytes + a
  valid ZIP structure.
- **webapp**: `getGenerationsUsage` unit test (peek does not deduct; Pro → unlimited) + the usage
  route.

## Out of scope

- Real-time streamed phase captions (Port-based) — deferred; round-trip only.
- "Generate tailored resume" wiring — no backend exists.
- Changing the webapp cover-letter pill redesign — tracked separately (the earlier "bigger,
  less vibe-coded" ask); this spec only adds the extension + the shared usage endpoint.
