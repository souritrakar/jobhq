# Chrome / Browser Extension — Domain Knowledge

> Living knowledge base for building this MV3 extension SaaS. Append durable, reusable
> insights here as we learn them. Keep entries concise and actionable. For the toolkit
> index (skills, links), see `DEV_RESOURCES.md`.
>
> **How to maintain:** add to the right section; date significant additions in the
> changelog at the bottom. Prefer verified facts over assumptions — when unsure, confirm
> against official docs (developer.chrome.com) or test in a real browser.

---

## 1. Manifest V3 fundamentals

- `manifest_version: 3` is mandatory; MV2 is being phased out. Start native MV3.
- Key limits: `name` ≤ 45 chars, `description` ≤ 132 chars (store-visible).
- Background runs as a **service worker** (`background.service_worker`), not a persistent page — no DOM, event-driven.
- Required icons: 16, 32, 48, 128 px.
- `permissions` (API permissions) and `host_permissions` (site access) are **separate top-level keys** in MV3 — a common gotcha.
- No remotely-hosted code allowed; all JS must ship in the package. No inline scripts (CSP blocks them) — move all JS to files.

## 2. Service worker (background) gotchas

- Terminates when idle (~30s). **Never rely on global variables or `setInterval`** for state or long-running tasks.
- Persist state in `chrome.storage.local` (or `.sync`); rehydrate on wake.
- Keep it minimal — ideally just a message relay / event router.
- For async `sendResponse`, **return `true`** from the `chrome.runtime.onMessage` listener to keep the channel open.
- Initialize defaults in `chrome.runtime.onInstalled`.
- Use `chrome.alarms` instead of timers for scheduled work.

## 3. Content scripts on SPAs (LinkedIn, Indeed, most job sites are React SPAs)

- Use **`MutationObserver`**, not polling — survives re-renders, handles element mount/unmount.
- **Avoid class-name selectors** — React regenerates class names. Target stable attributes
  (`data-testid`, `aria-*`, `name`, role) with multiple fallback selectors.
- For `contenteditable` inputs, read **`innerText`** not `value` (textarea assumptions break).
- Detecting submit may need both `keydown` (Enter) and click listeners, sometimes a ~100ms delay to let the UI settle.
- Use `{ passive: true }` on scroll/touch listeners to avoid jank.
- Content scripts run in an **isolated world** — no access to the page's JS variables; bridge via `window.postMessage` or injected scripts if needed.

## 4. Messaging / architecture

- Patterns: `chrome.runtime.sendMessage` (one-off), `chrome.runtime.connect` ports (long-lived), `chrome.tabs.sendMessage` (→ content script).
- Map the contexts: background SW ↔ content script ↔ popup ↔ side panel ↔ options. Each is a separate JS context with its own lifecycle.
- Side panel (`chrome.sidePanel`) is good for persistent, roomy UI alongside a page — strong fit for a job-tracker companion that stays open while browsing listings.

## 5. Storage

- `chrome.storage.local` — larger, device-local. `chrome.storage.sync` — small quota (~100KB), syncs across the user's devices; use for prefs.
- Storage is async and event-driven (`chrome.storage.onChanged`).
- Sensitive data (tokens) — avoid `sync`; consider encryption and minimal retention (ties to store privacy policy).

## 6. Chrome Web Store policy & submission (consult `cext-store-requirements` before submitting)

- **Single-purpose rule**: extension must do ONE clear thing. Bundled "multi-tools" get rejected. Keep the job-search feature set tightly scoped around one purpose.
- Declare the **minimum permissions** — fewer = higher user trust + install rate + smoother review. Prefer `activeTab`/`storage`; request host/optional permissions at runtime where feasible.
- Each permission needs a justification in the dashboard; a privacy policy is required if handling user data.
- Review takes **days → weeks**; plan launch timing. Can load unpacked (`chrome://extensions` dev mode) during review.

## 7. Security best practices (see `cext-security-best-practices`)

- Principle of least privilege for permissions and host access.
- Sanitize anything inserted into the DOM; prefer `textContent` over `innerHTML`. Use trusted-types / DOMPurify if rendering rich content.
- Validate message senders (`sender.id`, `sender.origin`) before acting on messages.
- Strict CSP; no remote code.

## 8. Testing & debugging (see `cext-debugging-guide`)

- Load unpacked via `chrome://extensions` (Developer mode) for iteration.
- Inspect the service worker via "Inspect views: service worker" on the extensions page.
- Content scripts debug in the page's DevTools; popup/side panel inspect separately.
- Vitest for units; Puppeteer or **chrome-devtools-mcp** for e2e against the live extension.

## 9. Monetization (SaaS angle — to expand)

- Common models: freemium with a paid tier gated by a backend/license check, subscriptions via Stripe, usage limits stored server-side.
- Don't trust client-side gating alone — verify entitlements on a backend.
- _(Expand with concrete patterns as we design the business model.)_

## 10. Save-panel UI (content-script Shadow DOM drawer)

The "Save to tracker" panel is **not** a `chrome.sidePanel` — it's a right-anchored, non-modal
drawer rendered in a **Shadow DOM** by the content script (`ui/modal.js`), so the host page's
CSS can't reach in and ours can't leak out. The dynamic application form lives in
`ui/application.js`; both files are scoped under `.apppane`/`:host`.

- **One modal, two entry buttons.** The real Save button and the amber dev/dummy button both
  call `JobTracker.ui.modal.open(...)`. Refine the modal/form once and both update — never fork
  a second panel for the dummy path.
- **Design tokens are the single source of truth.** Colors, radii, rings, and shadows are CSS
  custom properties on `:host` in `modal.js` (`all:initial` doesn't reset custom properties).
  `application.js` reads the same tokens, so the form stays consistent. Change a token, not a
  per-rule value.
- **Calm, dense productivity form (not a SaaS dashboard).** Conventions, as of the 2026-06-22 pass:
  - Rhythm: **16px** panel padding · **6px** label→control · **16px** between fields · **18–24px** between sections.
  - Controls: one shared **40px** height, **8px** radius (`--r2`), **1px** border (`--line-strong`),
    focus ring (`--ring`); inputs, selects, dates, and choice pills all match so they read as one system.
  - Type scale: header **15px** semibold · section titles **13px** semibold **sentence case** (no
    uppercase/letter-spacing) · labels **12px** medium · values **14px** · helper **12px** muted.
  - Red required asterisks (`--danger`) used consistently; Yes/No questions render as the same
    radio **pill** pattern as other option groups.
  - Reduce decoration: no card borders on consent checkboxes, minimal icons/shadows/color.
- **One sticky footer.** The action bar is `flex:0 0 auto`, a *sibling* of the scrollable `.body`
  (not inside it), with a top border + 16px padding — so it never overlaps scroll content. Quiet
  ghost **Cancel** + one filled primary (**Save application**).
- **Narrow-width safe.** Form grid is `repeat(auto-fit, minmax(170px,1fr))` → collapses to one
  column with no horizontal scroll; labels wrap (`overflow-wrap:anywhere`); the source host in the
  header truncates with ellipsis; textareas resize vertically.
- **XSS-safe rendering.** The form and description are built with `createElement`/`textContent`
  only — never `innerHTML` for model/page output — so a crafted label/option can't inject markup
  (ties to §7).
- **Extracted questions persist on save (optional).** Application-question extraction is
  user-triggered; results are cached per page in `chrome.storage.local` (`jt:appq:{url}`) for the
  UI. On **Confirm & Save**, `content.js` reads that cache and — only if questions exist —
  attaches `application: { questions }` to the `SAVE_JOB` payload, which the worker forwards to
  `POST /api/jobs`. The backend stores them 1:1 as `JobApplication` (validated JSON, stable per-
  question `id` + `order`). No extraction → field omitted → nothing application-related saved.

## 11. Two-tab panel & extraction model

The save panel has **two tabs** — Details and Application — switched in place (both panes mount;
the page stays interactive). Their extraction triggers differ deliberately:

- **Details auto-extracts on open** (`POST /api/extract`): one Groq call fills the fields + the
  cleaned description.
- **Application is user-triggered and never auto-runs.** The user opens/expands the real form on
  the page, then clicks "Extract application questions", which **re-captures the live DOM at click
  time** (`POST /api/extract-application`). Rationale: the form is often behind an "Apply" click or
  a collapsed section, and auto-running would double Groq spend on every panel open. Re-runnable via
  "Re-extract"; persistence of the result is covered in §10.
- **Restore on reopen.** The per-page cache (`jt:appq:{origin+pathname}`, §10) is read on open and
  re-renders prior questions so the tab isn't blank — but only while it's still blank, guarded so a
  late storage read can't clobber an in-flight fresh extraction.
- **Rate limits surface as a retry state**, not a dead end: a Groq 429 (after the server's own
  retries — see `webapp/docs/BACKEND.md`) becomes a "The AI service is busy… try again" message
  with a Try-again button.
- **Descriptions render clean, never raw HTML.** The backend's cleaned description may contain HTML;
  `modal.js` parses it (DOMParser → paragraphs/headings/lists rebuilt via `textContent`) and clamps
  long bodies behind "Show more" (ties to §7).

---

## Open questions / to verify
- Exact current service-worker idle timeout and keep-alive options.
- LinkedIn DOM stable selectors for job postings / application forms (capture once we inspect live).
- Whether features need `host_permissions` broad match vs `activeTab`.

## Changelog
- 2026-06-17 — Seeded from MV3 best practices, two 2026 dev.to field guides, and the installed `cext-*` skills. Greenfield project; no app code yet.
- 2026-06-22 — Added §10 Save-panel UI: Shadow DOM drawer conventions (token source of truth, one-modal/two-buttons, 40px/8px control system, type scale, single sticky footer, narrow-width rules) after the calm-dense-form refinement of `ui/modal.js` + `ui/application.js`.
- 2026-06-22 — Extracted application questions now persist to the backend on save (optional): `content.js` attaches cached `application.questions` to `SAVE_JOB` → `POST /api/jobs`, stored 1:1 as `JobApplication`. See §10 and `webapp/docs/BACKEND.md`.
- 2026-06-22 — Added §11 two-tab panel & extraction model: Details auto-extracts on open; Application is user-triggered with live-DOM recapture + re-extract; per-page cache restore-on-reopen with a race guard; Groq 429s surface as a retry state; descriptions render via DOMParser (no raw HTML) with "Show more".
