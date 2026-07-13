# Extension Production Auth — Design Spec

**Date:** 2026-07-13
**Status:** Design approved; ready for implementation plan (writing-plans)
**Author:** brainstorming session (Souritra + Claude)
**Related memory:** `[[cloudflare-deployment]]`, `[[email-infrastructure]]`, `[[neon-auth-webapp]]`, `[[billing-autumn]]`, `[[extension-persistence-and-save-warnings]]`, `[[extension-cover-letter-wiring]]`, `[[autofill-module]]`

---

## 1. Why this exists (the problem)

The Chrome extension currently runs as **one hardcoded test user**. In `extension/background.js`:

```js
const API_BASE = "http://localhost:3100";
// We don't send an auth header, so the backend uses DEV_USER_ID (the dev seam).
```

Every extension → backend call has **no identity attached**. In development the backend fills in
a fake user (`DEV_USER_ID`) via the fail-closed dev seam. **In production that fallback is off**
(`webapp/lib/auth/current-user.ts`: `getUserId` throws `ApiError.unauthorized()` unless
`DEV_AUTH_SEAM && NODE_ENV !== "production"`). So against `https://jobhq.co` every extension call
returns **401** and the extension is dead.

**"Extension auth" = give the extension a way to prove which logged-in user it is on every backend
call, exactly like the website does — plus gate all features behind sign-in and keep the local
cache correctly tied to the right user.**

This is a **hard launch blocker** and the **critical path** for the all-at-once launch: it gates the
Chrome Web Store submission (multi-day review). See `[[cloudflare-deployment]]` "Launch blockers".

---

## 2. Current-state facts (verified 2026-07-13)

- **Auth seam:** `webapp/lib/auth/current-user.ts` → `getUserId(req)` resolves: (1) Neon Auth session
  cookie, else (2) dev `x-user-id`/`DEV_USER_ID` (only if `DEV_AUTH_SEAM` + non-prod), else throws.
- **Neon Auth** (managed Better Auth, Supabase-style) issues **JWTs** and publishes a **JWKS**
  endpoint (`<NEON_AUTH_BASE_URL>/.well-known/jwks.json`). `docs/AUTH.md` line ~227 names the
  "extension/API JWT path" as the intended direction. Session cookie is **SameSite=Lax** (so it is
  NOT sent on the extension's cross-site fetch — a pure-cookie approach won't work).
- **Extension API calls:** `apiFetch` (`extension/background.js:526`) is the main JSON choke point,
  BUT streaming/binary calls bypass it: Ask AI chat (`~line 91`), cover letter (`~585`), document
  raw download (`~640`), single job GET (`~618`). All must get the auth header.
- **Manifest** (`extension/manifest.json`, MV3): permissions `storage, activeTab, scripting, alarms,
  notifications`; `host_permissions` only `http://localhost:3100/*`; UI is **content-script-injected**
  (drawer/panel via `ui/modal.js`, `ui/todo.js`, etc.) **plus** a toolbar `popup/popup.html`. No
  `identity`, no `cookies`, no `externally_connectable` yet.
- **CORS** (`webapp/lib/api/cors.ts`): echoes allowed origin from `ALLOWED_ORIGINS`; **already
  advertises the `Authorization` header**; in dev allows any `chrome-extension://` origin.
- **Prisma schema:** `webapp/prisma/schema.prisma` (Prisma 7; URLs in `prisma.config.ts`; Neon
  driver adapter in `lib/db.ts`).
- **Billing** (`[[billing-autumn]]`): Free/Pro via Autumn; server gate `lib/server/billing.ts`;
  Free gets metered/gated AI (402 for over-limit); extension already handles 402
  (`[[extension-cover-letter-wiring]]`, metered-gating).

---

## 3. Requirements (decisions locked in brainstorming)

| # | Decision | Choice |
|---|---|---|
| R1 | Sign-in UX | **Web handoff** — reuse the website login (email/OTP/Google); no rebuilt UI in the extension |
| R2 | Session longevity | **Long-lived extension key** minted by the site, stored in the extension, revocable ("sign out everywhere"). NOT Neon short-JWT-refresh |
| R3 | Cache on sign-out / user-switch | **Wipe** all locally cached app data on sign-out AND when a different user signs in |
| R4 | Free vs Pro access | **Free can use the extension**; Pro-only features gate inside (upgrade prompts / metered), same as the website |
| R5 | Gate | Extension is **fully gated** — no capture/autofill/AI until signed in |

**Chosen sign-in primitive:** `chrome.identity.launchWebAuthFlow` — Chrome's standard OAuth-for-
extensions flow. Chrome cryptographically binds the returned redirect
(`https://<ext-id>.chromiumapp.org/`) to *this* extension, so no other extension/site can intercept
the key. Preferred over `externally_connectable` messaging.

---

## 4. Design

### Section 1 — Backend: the extension key

- **New Prisma model `ExtensionToken`** (`webapp/prisma/schema.prisma`):
  - `id`, `userId` (FK → users, indexed, cascade on user delete),
  - `tokenHash` (SHA-256 of the raw key — store the hash ONLY, never the raw key; unique index),
  - `createdAt`, `lastUsedAt` (bumped throttled, e.g. at most once/60s), `revokedAt` (nullable),
  - `label` (e.g. "Chrome extension"), optional `userAgent`.
  - Raw key format: **`jhqx_<crypto-random>`** — returned to the extension once, never stored raw.
- **New route `GET /extension/connect`** (webapp):
  - Requires a logged-in session (`getSessionUser`; if none, falls through to existing
    `/auth/sign-in` with a callback back to `/extension/connect`, so login just works).
  - Reads the extension's Chrome-issued `redirect_uri` (`chrome.identity.getRedirectURL()`), and a
    `state` nonce. **Validate `redirect_uri` host ends with `.chromiumapp.org`** (block open-redirect).
  - Mints an `ExtensionToken` for the authenticated user, stores the hash, and **302-redirects** to
    `<redirect_uri>#token=<raw>&state=<state>` (fragment, so the raw key never hits a server log).
- **Auth seam change** (`webapp/lib/auth/current-user.ts` → `getUserId`): add a branch —
  1. Neon session cookie (existing, first).
  2. **NEW:** `Authorization: Bearer jhqx_…` → SHA-256 → look up `ExtensionToken` → reject if
     `revokedAt` set → bump `lastUsedAt` → `ensureLocalUser` (join user row for email/name) →
     return `userId`.
  3. Dev `x-user-id`/`DEV_USER_ID` (existing, dev-only, last).
  Throw `ApiError.unauthorized()` otherwise.
- **Revocation:**
  - `POST /api/extension/revoke` — revokes the caller's key (extension sign-out calls this).
  - `/dashboard/settings` gets a **"Disconnect extension" / "Sign out everywhere"** control that
    revokes all of the user's `ExtensionToken`s.
- **CORS / config:** add the published extension origin to `ALLOWED_ORIGINS` (post-Web-Store);
  `Authorization` header already advertised — no cors.ts change needed for the header itself.

### Section 2 — Extension: sign-in + the gate

- **New `extension/lib/auth.js`** (unit-testable, vitest+jsdom):
  - `signIn()` → `chrome.identity.launchWebAuthFlow({ url: connectUrl, interactive: true })` →
    parse `#token`/`state` from the returned redirect → store `{ token, userId, email, name }` in
    `chrome.storage.local` under `jhq:auth`.
  - `getToken()`, `isSignedIn()`, `getUser()`.
  - `signOut()` → call `/api/extension/revoke` → **wipe** all `jt:*` cache keys + `jhq:auth`.
- **Header injection everywhere:** route `apiFetch` AND the bypassing streaming/binary calls
  (Ask AI, cover letter, doc download, single-job GET) through ONE helper that adds
  `Authorization: Bearer <token>`. A missing token → don't call; show the gate.
- **The gate:** on panel open AND popup open, check `isSignedIn()`. If not signed in, render the
  **🔒 "Sign in to continue"** screen: `[Sign in]` → `signIn()`; "New here? Create account" → opens
  `https://jobhq.co/auth/sign-up`. **Block all features** (capture, autofill, AI) until signed in.
- **`401` = signed out:** any backend `401` (revoked/expired key) → clear auth + cache → show gate.

### Section 3 — Local cache safety + billing (explicit user concerns)

- **Wipe rules (R3):**
  - Sign-out → wipe all `jt:*` app cache + `jhq:auth`.
  - Sign-in → if returned `userId` ≠ last cached `userId`, **wipe the previous user's cache first**
    (shared-computer protection). Persist the current `userId` to detect the switch.
  - Keep it simple: single-user-at-a-time cache + wipe on boundary (no per-user namespacing needed).
- **Billing/gating (R4), keyed to the real user:**
  - **`401`** = not signed in → gate. **`402`** = signed in, needs Pro → existing upgrade prompt.
    These two must be handled distinctly (today 401 has no real handling).
  - The "generations remaining" / Pro pill fetches `GET /api/billing/usage` with the Bearer key on
    sign-in and reflects real state (`[[extension-cover-letter-wiring]]` shared usage peek).

### Section 4 — Config coupling + testing

- **Manifest changes:** add `identity` permission; add `https://jobhq.co/*` host permission;
  switch `API_BASE` → `https://jobhq.co` (keep a localhost toggle for dev).
- **Deploy coupling (unchanged from launch plan):** the published Web Store **extension ID** must be
  added to `ALLOWED_ORIGINS` and the webapp **redeployed** — happens at the extension-release step.
  `launchWebAuthFlow` works with the **unpacked** extension in dev (redirect uses the unpacked id),
  so we can E2E before publishing.
- **Tests:**
  - Extension unit (vitest+jsdom): auth module — storage, header injection, `401`→wipe,
    user-switch wipe, gate visibility.
  - Backend: key mint (connect route), `getUserId` Bearer path, revoke, redirect_uri validation.
  - Manual E2E: unpacked extension against local webapp — sign in via `launchWebAuthFlow`, verify
    gated features unlock, sign-out wipes cache, 402 still gates Pro features.

---

## 5. Security notes

- Store only the **hash** of the key; raw key shown once, delivered via URL **fragment**.
- `redirect_uri` must end in `.chromiumapp.org` (Chrome-bound to the extension) — validated server-side.
- Key is **revocable** (settings + on sign-out); `401` on a revoked key self-heals the extension to
  the gate.
- The dev `x-user-id` seam stays **fail-closed** (dev-only) and is unaffected.
- Consider (optional, later) key rotation / `expiresAt`; MVP is long-lived + revocable.

---

## 6. Task / TODO list

**Brainstorming checklist (this session):**
1. ✅ Explore extension + webapp auth context
2. ✅ Clarify requirements (one question at a time) — R1–R5 locked
3. ✅ Propose approaches (chosen via the requirement questions)
4. ✅ Present design sections + approval
5. ⏳ Write + self-review spec (this file), user review → then writing-plans

**Implementation tasks (for the plan / next session):**
- [ ] **Backend/DB:** add `ExtensionToken` model + migration (Prisma 7; remember per-request client
  on workerd, `[[cloudflare-deployment]]`).
- [ ] **Backend/route:** `GET /extension/connect` (session-gated, redirect_uri validation, mint +
  fragment redirect).
- [ ] **Backend/seam:** `getUserId` Bearer branch + `ensureLocalUser` from token row.
- [ ] **Backend/revoke:** `POST /api/extension/revoke` + `/dashboard/settings` "Disconnect
  extension" control.
- [ ] **Extension/auth:** `extension/lib/auth.js` (signIn/getToken/isSignedIn/getUser/signOut) +
  tests.
- [ ] **Extension/fetch:** single Bearer-header helper across `apiFetch` + streaming/binary calls;
  `401`→wipe→gate.
- [ ] **Extension/gate UI:** sign-in gate on panel + popup; block all features until signed in;
  "Create account" link.
- [ ] **Extension/cache:** wipe on sign-out + user-switch; persist current `userId`.
- [ ] **Extension/billing:** distinguish 401 vs 402; fetch `GET /api/billing/usage` on sign-in;
  Pro/remaining pill.
- [ ] **Manifest:** `identity` permission, `https://jobhq.co/*` host permission, `API_BASE` prod +
  dev toggle.
- [ ] **Deploy coupling (at release):** add published extension id to `ALLOWED_ORIGINS`, redeploy.
- [ ] **Tests:** extension unit + backend + manual E2E.

---

## 7. Open items to verify during implementation

- Exact `chrome.identity.launchWebAuthFlow` return-URL parsing + how `/extension/connect` sets the
  fragment redirect through Chrome's flow.
- Stable extension ID strategy: unpacked = random id (fine for dev). For a **stable** id across dev
  reloads (helps CORS/testing), optionally pin a `key` in the manifest; otherwise the id is fixed
  once published to the Web Store.
- Whether to also verify Neon JWTs via JWKS in the seam later (not needed now; own key is source of
  truth for the extension).

---

## 8. Where this sits in the launch

Part of the **all-at-once launch** (deploy held until this + Stripe-live are done). Remaining launch
items after this feature: Stripe live + Autumn live, provider spend caps, verify Neon prod DB
migrated, deploy (secrets + `cf:deploy` + custom domain + `qstash:setup`), Web Store publish → add
ext id to `ALLOWED_ORIGINS` + redeploy, then HSTS + re-enable DNSSEC. See `[[cloudflare-deployment]]`.
