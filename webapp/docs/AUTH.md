# Auth: Neon Auth (Better Auth) — webapp

How the web app authenticates users with **Neon Auth** (managed auth built on **Better Auth**),
how it bridges those identities into our local `users` table, and how route protection / sign-out /
auth state work. The Chrome extension authenticates separately with a long-lived Bearer key — see
**"Extension auth (Bearer key)"** below.

Read [`BACKEND.md`](BACKEND.md) first for the route → validation → service → db layering and the
user-scoping model this builds on.

## Why Neon Auth

Identity lives in **our own Neon Postgres** (the `neon_auth` schema), branches with the database, and
needs zero auth infrastructure to run. We use the **API-methods** integration (not the pre-built UI)
so the sign-in / sign-up screens are our own shadcn components, consistent with the design system.

- Package: `@neondatabase/auth` (server: `@neondatabase/auth/next/server`, client: `@neondatabase/auth/next`).
- Auth runs as a managed REST service; the SDK proxies browser calls through our own
 `/api/auth/[...path]` route, so the browser only ever talks same-origin (no CORS, cookie-friendly).
- Sessions are an HTTP-only signed cookie. `auth.getSession` reads + caches it server-side.

## Supported sign-in methods (this iteration)

1. **Email + password** — `name` is required at sign-up.
2. **Email verification by code (OTP)** — after sign-up the user enters a numeric code emailed to
 them (`emailOtp.verifyEmail`); on success they're auto-signed-in. Works with Neon's shared email
 provider (no custom SMTP needed).
3. **Google** — OAuth via `signIn.social({ provider: "google" })`.

## Architecture at a glance

```
 browser (webapp)
 │ same-origin fetch (cookie auto-sent)
 ▼
 app/api/auth/[...path]/route.ts ← auth.handler (proxies to Neon Auth REST service)
 │
 ▼
 Neon Auth service ──writes──► neon_auth.* (users, sessions, oauth) [same Neon project]

 proxy.ts (Next 16 middleware) ── protects /dashboard/* ── redirects to /auth/sign-in if no session

 Server Components / Route Handlers
 │ auth.getSession → { data: { session: { user: { id, name, email, emailVerified } } } }
 ▼
 lib/auth/current-user.ts ── getServerUserId/getUserId ── + ensureLocalUser
 │ (bridge → public.users)
 ▼
 lib/server/* (all DB access, scoped by userId — unchanged)
```

## The identity bridge (critical)

Our schema has a **local `users` table** and every owned row (`Job`, `Reminder`, `Document`, …) has a
`userId` **foreign key** to it (`onDelete: Cascade`). Neon Auth stores its users in the **separate
`neon_auth` schema**, so a freshly-authenticated user has **no matching `public.users` row** — any
insert would violate the FK.

**Fix:** `ensureLocalUser(sessionUser)` upserts `{ id, email, name }` into `public.users` using the
Neon Auth user id as the primary key. It's called at the dashboard chokepoint (the dashboard layout,
via `getSessionUser`) and memoized per server process so it's at most one cheap upsert per cold
start per user. After that the FK is always satisfied for that user's service calls.

- `User.id` is `String` (was `@default(cuid)`); we now **supply** the Neon Auth id explicitly, so
 no schema change is required.
- We deliberately **don't** store the avatar image — the `Avatar` is initials-only; the session's
 `image` (Google) is read directly in the shell when present.

> **Existing dev data:** rows seeded under `DEV_USER_ID` belong to that id. A new Neon Auth account
> gets a new id and an empty dashboard. To claim the old data, repoint it once:
> `UPDATE ... SET "userId" = '<neon-auth-id>' WHERE "userId" = '<DEV_USER_ID>';` (or just re-seed).
> Sign up with an email **different** from the seed user's to avoid the `users.email` unique clash.

## The auth seam (`lib/auth/current-user.ts`)

Both resolvers become **async** (Better Auth's `getSession` is async). Every call site adds `await`.

- `getSessionUser` — server components only. Reads the session; **redirects to `/auth/sign-in`** if
 none; calls `ensureLocalUser`; returns the full user (for display).
- `getServerUserId: Promise<string>` — `(await getSessionUser).id`. Used by dashboard pages.
- `getUserId(req): Promise<string>` — route handlers. Tries the Neon Auth session first (cookie →
 webapp). Falls back, **non-prod only**, to the dev `x-user-id` header / `DEV_USER_ID` (the
 extension's seam). Otherwise throws `ApiError.unauthorized` — API routes return the JSON envelope,
 they never redirect.

## Extension auth (Bearer key)

The webapp uses cookies; the Chrome extension can't. It authenticates with a long-lived opaque key
(`jhqx_<hex>`) sent as `Authorization: Bearer jhqx_…`. This is the **real** extension auth that
replaces the dev `x-user-id` seam in production.

**The mint flow — `GET /extension/connect`** (`app/extension/connect/route.ts`). The extension opens
this URL inside Chrome's `identity.launchWebAuthFlow` popup (a top-level browser navigation, not a
CORS fetch — so no preflight, no `{ data }` envelope, it only redirects):

1. `?redirect_uri=<chrome>&state=<nonce>` — `validateRedirectUri`
 (`lib/server/extension-connect.ts`) requires an `https://<extension-id>.chromiumapp.org` host
 (Chrome binds this per-extension, so the key can only ever be delivered back **into** an
 extension — the open-redirect guard). In **production** (`strict`) `<extension-id>` must also be in
 **`EXTENSION_IDS`**; in dev any `*.chromiumapp.org` is accepted. A bad/absent `redirect_uri` or an
 implausible `state` (length 8–512) is refused with a plain 400 (no redirect anywhere).
2. Not signed in → 302 to `/auth/sign-in?next=<this url>` (relative `next`, no open redirect), so
 login "just works" and returns here to complete the mint.
3. Signed in → `mintExtensionToken(user)` and hand the raw key back via the URL **fragment**:
 `…chromiumapp.org#token=<raw>&state=<nonce>`. The fragment is never sent to the server, so the raw
 key never lands in an access log. (`GET /api/extension/me` is then called with the Bearer key to
 learn identity + plan — kept out of the connect URL on purpose.)

**The token model — hash-only** (`ExtensionToken` in `prisma/schema.prisma`,
`lib/server/extension-tokens.ts`). We store **only the SHA-256 hash** of the key (`tokenHash`,
unique-indexed); the raw `jhqx_` key (256 bits of CSPRNG) is returned once at mint and is
unrecoverable, so a DB compromise cannot impersonate a user. All crypto is Web Crypto (runs
identically on Node and workerd). `mintExtensionToken` bridges the local `users` row first (FK), so a
resolved Bearer key never needs `ensureLocalUser`. `lastUsedAt` is bumped throttled (best-effort,
never fails the request).

**The `getUserId` Bearer branch** (`lib/auth/current-user.ts`). Resolution order for API routes:
**(1)** Neon Auth session cookie (webapp) → **(2)** `Authorization: Bearer jhqx_…` → resolve to
userId, else `ApiError.unauthorized` → **(3)** the dev `x-user-id`/`DEV_USER_ID` seam
(non-prod + `DEV_AUTH_SEAM` only). A Bearer header is an **explicit auth attempt**: an
invalid/revoked key **throws 401 and never falls through** to the spoofable dev seam.

**Revocation.** Setting `revokedAt` makes a key reject on its next call (which self-heals the
extension back to its sign-in gate). It happens via:
- **Settings → "Disconnect extension"** (`components/dashboard/settings/extension-connection.tsx` →
 `disconnectExtensionAction`) — a Server Action that authenticates from the session and calls
 `revokeAllForUser`.
- **`POST /api/extension/revoke`** — the extension's own sign-out / "sign out everywhere"; the caller
 authenticates with the very key being revoked. Idempotent.
- **Account deletion** — `extension_tokens` FK-cascades with the `users` row.

**Deploy coupling (must stay in sync).** In production an extension release requires: the published
`chrome-extension://<id>` origin in **`ALLOWED_ORIGINS`** (else CORS blocks every call), the `<id>` in
**`EXTENSION_IDS`** (else the connect mint is refused), and a **webapp redeploy** so both take effect.
See docs/DEPLOYMENT.md "Extension release coupling".

## Client errors THROW (not `{ error }`) — every form must `try/catch`

Unlike vanilla Better Auth (which resolves to `{ data, error }`), the Neon Auth **client** adapter
**throws** an `AuthApiError` on any failed call — `authClient.signIn.email`, `signUp.email`,
`emailOtp.verifyEmail`, etc. (`normalizeBetterAuthError → customFetchImpl`). If a form does
`const { error } = await authClient.signIn.email(...)` with no `try/catch`, the throw escapes, the
pending state never resets (**the button hangs forever**) and no message is shown.

- **Rule:** wrap every `authClient.*` call in `try/catch`; in the catch, run the thrown value
 through **`authErrorMessage(err, fallback)`** (`lib/auth/errors.ts`) and reset `pending`.
- The thrown error carries a normalized snake_case `code` (`invalid_credentials`,
 `email_not_confirmed`, …) + `message` + HTTP `status`. `authErrorMessage` maps known codes to
 friendly, security-conscious copy, with a **message-text fallback** (Better Auth's
 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` normalizes via HTTP 422 → `validation_failed`, losing the
 specific code, so we also pattern-match the message).
- **Account enumeration:** at sign-in, a missing account and a wrong password both surface as
 `invalid_credentials` on purpose — don't try to distinguish them.
- Shared UI: **`<AuthAlert>`** (`components/auth/auth-alert.tsx`) renders error/success with a
 fade+slide-in animation, consistent across sign-in / sign-up / verify.
- The **server** methods (`auth.getSession`) return `{ data, error }` and do **not** throw — only
 the browser client (`authClient.*`) throws.
- The root layout sets `suppressHydrationWarning` on `<html>`/`<body>` so browser-extension-injected
 attributes (password managers, recorders, …) don't throw a hydration overlay on full page loads.

## Sign-out is client-side — and the origin must be a trusted origin

Sign-out runs in the browser: `components/dashboard/user-menu.tsx` calls **`authClient.signOut`**
(a real same-origin fetch to `/api/auth/sign-out`) and then hard-navigates with
`window.location.href = "/auth/sign-in"`. The hard `window.location` navigation (not the client
router) re-reads the now-empty session server-side with no stale RSC/router cache. The client
**throws** on failure (see above), so we `try/catch` and navigate anyway — the sign-in page re-gates
on the session, so a failed clear can't silently land on an authed screen.

**The real bug that made sign-out "not work".** Clicking Sign out bounced straight back
to `/dashboard` still logged in. Captured live: `POST /api/auth/sign-out` returned **403
`{"code":"INVALID_ORIGIN"}`**, so no `Set-Cookie` clear was ever issued and the session survived.
The `/api/auth` proxy forwards the browser's `Origin` header to the **upstream** Neon Auth service,
which validates it against the project's **trusted origins** (Better Auth's CSRF gate on
state-changing endpoints). The dev server sends `Origin: http://localhost:3100` (HTTP), but the
project's trusted origins only listed the **HTTPS** variant `https://localhost:3100`, and
`allow_localhost` was `false` → rejected. (Google OAuth sign-in still worked because it's a top-level
redirect flow, not an `Origin`-bearing fetch — which is why sign-*in* looked fine while sign-*out*
failed.) Note a server-action sign-out would have hit the **same** 403; this was never a cookie bug.

**Fix — Neon Auth config, not app code.** `createNeonAuth` has no trusted-origins option; it's set on
the hosted instance. Added `http://localhost:3100` to `trusted_origins` (via the Neon MCP
`configure_neon_auth` → `add_trusted_origin`; `set_allow_localhost=true` is the broader dev toggle).
After that, `POST /api/auth/sign-out` → `200 {"success":true}`, `get-session` → `null`, and
`/dashboard` correctly redirects to `/auth/sign-in`. **Every deployment origin must be a trusted
origin** — prod (`https://convenience-track.vercel.app`) already is; add new ones when they appear.
The leftover `neon-auth.local.session_data` cache cookie is harmless (ignored without a token) and
the middleware clears it on the next protected-route visit.

**Guard exemption still stands (`proxy.ts`).** The `Next-Action`-header short-circuit to
`NextResponse.next` remains — not for sign-out anymore, but as a general safeguard so any *other*
`/dashboard` Server Action can't receive a guard redirect it can't parse (*"An unexpected response
was received from the server."*). Server Actions self-authenticate (`getServerUserId` redirects when
there's no session), so skipping the route guard for them is safe. Normal `/dashboard` GETs are still
guarded.

## Route protection & navigation edge cases

- **`proxy.ts`** (Next 16's `middleware.ts`) runs `auth.middleware({ loginUrl: "/auth/sign-in" })`
 with `matcher: ["/dashboard/:path*"]`. Cold links to any dashboard URL without a session → redirect
 to sign-in (preserving the intended path so we can return there post-login).
- **Auth pages** (`/auth/sign-in`, `/auth/sign-up`) check the session on the server and **redirect
 already-signed-in users to `/dashboard`** (no flashing a login form at logged-in users).
- **After sign-in / verify** → `/dashboard`. The landing page (`/`) and `/api/*` stay public/unchanged
 (matcher covers only `/dashboard`).
- **Multiple tabs / profiles / incognito:** sessions are cookies, so each browser profile / incognito
 window is its own session (expected). Sign-out clears the cookie; other tabs hit the middleware on
 their next navigation and get redirected. Client mutations that 401 mid-session surface the error
 and the next navigation re-gates. OTP is tied to the email, not the tab, so verification works from
 any tab/window.
- **Safari on http://localhost** blocks third-party cookies; use `next dev --experimental-https` if
 testing Safari locally (Chrome/Firefox are fine on http).

## Files

| File | Role |
| --- | --- |
| `lib/auth/server.ts` | `createNeonAuth({ baseUrl, cookies:{ secret } })` → server `auth` instance |
| `lib/auth/client.ts` | `createAuthClient` → browser `authClient` |
| `lib/auth/current-user.ts` | `getSessionUser` / `getServerUserId` / `getUserId` / `ensureLocalUser` |
| `lib/server/users.ts` | `ensureUser({id,email,name})` upsert into `public.users` |
| `app/api/auth/[...path]/route.ts` | `export const { GET, POST } = auth.handler` |
| `proxy.ts` | route-protection middleware |
| `app/auth/layout.tsx` | public, centered auth shell (warm-paper background, brand) |
| `app/auth/sign-in/page.tsx` + `sign-in-form.tsx` | email/password + Google |
| `app/auth/sign-up/page.tsx` + `sign-up-form.tsx` | name/email/password → OTP verify + Google |
| `components/dashboard/user-menu.tsx` | avatar → popover with name/email + Sign out |

## Environment variables

| Var | Purpose |
| --- | --- |
| `NEON_AUTH_BASE_URL` | The branch's Auth URL (Console → Branch → Auth → Configuration). Server-only. |
| `NEON_AUTH_COOKIE_SECRET` | ≥32-char secret signing the session cookie (`openssl rand -base64 32`). Server-only. |

No `NEXT_PUBLIC_*` needed — the client SDK talks to the same-origin `/api/auth` proxy.

## One-time Neon Console setup (manual — not code)

Done by a human in the [Neon Console](https://console.neon.tech) (Project → Branch → **Auth**), since
it needs provider secrets the app never sees:

1. **Email:** enable **Sign-up with Email**, **Verify at Sign-up**, method = **Verification codes**.
2. **Google:** enable the **Google** OAuth provider (add Google client id/secret, or use Neon's dev
 shared credentials), and add the app origins to **redirect/trusted domains**
 (`http://localhost:3100` for dev, the deployed origin for prod).
3. **Application name** — set to "JobTracker" (shown in verification emails).

## Account deletion (self-service erasure)

`Settings → Delete account` (privacy policy §9 / GDPR erasure / CCPA delete). The flow:

1. `components/dashboard/settings/danger-zone.tsx` — type-to-confirm modal → calls the
 `deleteAccountAction` **Server Action** (`app/dashboard/settings/actions.ts`), which resolves the
 caller from the session (`getServerUserId`), so a user can only delete **their own** account.
2. `lib/server/account.ts` `deleteAccount(userId)` erases everything, idempotently:
 - the user's R2 document bytes,
 - `prisma.user.delete` (its `onDelete: Cascade` FKs wipe every app table in one statement),
 - the **Neon Auth identity** via direct SQL: `DELETE FROM neon_auth."user" WHERE id = $userId`
 (FK-cascades `account`/`session`/`member`/`invitation`) plus a `neon_auth."verification"` cleanup
 by email. `public.users.id` is the Neon Auth user id verbatim (the identity bridge), so the same
 id addresses both schemas.
3. The action then `auth.signOut` (cookie cleanup, best-effort) and redirects to `/`.

**Why direct SQL, not `auth.deleteUser`:** the hosted Better Auth self-service delete requires it to
be enabled in the Neon Console AND a password / fresh session / email-verification round-trip, and the
client method returns `{ error }` **without throwing** — so a no-arg call fails silently and leaves the
identity behind (the email stays "already taken"). Neon Auth's tables live in the `neon_auth` schema of
the SAME database and our `neondb_owner` role owns them, so a direct delete is immediate and reliable.
The identity delete throws on failure (never a silent half-delete); the whole function is retry-safe.

## Testing notes

- `npm run dev` (port 3100), open `/auth/sign-up`, create an account, enter the emailed code, land on
 `/dashboard`. Sign out from the profile menu → redirected to `/auth/sign-in`.
- Without the Console email/Google setup above, sign-up still creates the user but the code email and
 the Google button won't function — they're managed-service config, not app code.
- The future **extension/API JWT path** can verify the Neon Auth JWT via the JWKS endpoint
 (`<NEON_AUTH_BASE_URL>/.well-known/jwks.json`); out of scope here (webapp only).
