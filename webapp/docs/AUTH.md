# Auth: Neon Auth (Better Auth) — webapp

How the web app authenticates users with **Neon Auth** (managed auth built on **Better Auth**),
how it bridges those identities into our local `users` table, and how route protection / sign-out /
auth state work. **Webapp only for now** — the Chrome extension keeps the dev `x-user-id` seam until
its own auth lands.

Read [`BACKEND.md`](BACKEND.md) first for the route → validation → service → db layering and the
user-scoping model this builds on.

## Why Neon Auth

Identity lives in **our own Neon Postgres** (the `neon_auth` schema), branches with the database, and
needs zero auth infrastructure to run. We use the **API-methods** integration (not the pre-built UI)
so the sign-in / sign-up screens are our own shadcn components, consistent with the design system.

- Package: `@neondatabase/auth` (server: `@neondatabase/auth/next/server`, client: `@neondatabase/auth/next`).
- Auth runs as a managed REST service; the SDK proxies browser calls through our own
  `/api/auth/[...path]` route, so the browser only ever talks same-origin (no CORS, cookie-friendly).
- Sessions are an HTTP-only signed cookie. `auth.getSession()` reads + caches it server-side.

## Supported sign-in methods (this iteration)

1. **Email + password** — `name` is required at sign-up.
2. **Email verification by code (OTP)** — after sign-up the user enters a numeric code emailed to
   them (`emailOtp.verifyEmail`); on success they're auto-signed-in. Works with Neon's shared email
   provider (no custom SMTP needed).
3. **Google** — OAuth via `signIn.social({ provider: "google" })`.

## Architecture at a glance

```
            browser (webapp)
                  │  same-origin fetch (cookie auto-sent)
                  ▼
   app/api/auth/[...path]/route.ts   ← auth.handler()  (proxies to Neon Auth REST service)
                  │
                  ▼
        Neon Auth service  ──writes──►  neon_auth.*  (users, sessions, oauth)  [same Neon project]

   proxy.ts (Next 16 middleware)  ── protects /dashboard/* ── redirects to /auth/sign-in if no session

   Server Components / Route Handlers
        │  auth.getSession()  → { data: { session: { user: { id, name, email, emailVerified } } } }
        ▼
   lib/auth/current-user.ts  ── getServerUserId()/getUserId() ── + ensureLocalUser()
        │                                                          (bridge → public.users)
        ▼
   lib/server/*  (all DB access, scoped by userId — unchanged)
```

## The identity bridge (critical)

Our schema has a **local `users` table** and every owned row (`Job`, `Reminder`, `Document`, …) has a
`userId` **foreign key** to it (`onDelete: Cascade`). Neon Auth stores its users in the **separate
`neon_auth` schema**, so a freshly-authenticated user has **no matching `public.users` row** — any
insert would violate the FK.

**Fix:** `ensureLocalUser(sessionUser)` upserts `{ id, email, name }` into `public.users` using the
Neon Auth user id as the primary key. It's called at the dashboard chokepoint (the dashboard layout,
via `getSessionUser()`) and memoized per server process so it's at most one cheap upsert per cold
start per user. After that the FK is always satisfied for that user's service calls.

- `User.id` is `String` (was `@default(cuid())`); we now **supply** the Neon Auth id explicitly, so
  no schema change is required.
- We deliberately **don't** store the avatar image — the `Avatar` is initials-only; the session's
  `image` (Google) is read directly in the shell when present.

> **Existing dev data:** rows seeded under `DEV_USER_ID` belong to that id. A new Neon Auth account
> gets a new id and an empty dashboard. To claim the old data, repoint it once:
> `UPDATE ... SET "userId" = '<neon-auth-id>' WHERE "userId" = '<DEV_USER_ID>';` (or just re-seed).
> Sign up with an email **different** from the seed user's to avoid the `users.email` unique clash.

## The auth seam (`lib/auth/current-user.ts`)

Both resolvers become **async** (Better Auth's `getSession()` is async). Every call site adds `await`.

- `getSessionUser()` — server components only. Reads the session; **redirects to `/auth/sign-in`** if
  none; calls `ensureLocalUser`; returns the full user (for display).
- `getServerUserId(): Promise<string>` — `(await getSessionUser()).id`. Used by dashboard pages.
- `getUserId(req): Promise<string>` — route handlers. Tries the Neon Auth session first (cookie →
  webapp). Falls back, **non-prod only**, to the dev `x-user-id` header / `DEV_USER_ID` (the
  extension's seam). Otherwise throws `ApiError.unauthorized()` — API routes return the JSON envelope,
  they never redirect.

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
- The **server** methods (`auth.signOut()` in `lib/auth/actions.ts`, `auth.getSession()`) return
  `{ data, error }` and do **not** throw — only the browser client throws.
- The root layout sets `suppressHydrationWarning` on `<html>`/`<body>` so browser-extension-injected
  attributes (password managers, recorders, …) don't throw a hydration overlay on full page loads.

## Sign-out crosses the middleware — actions must be exempt from the guard

Sign-out is a **Server Action** (`signOutAction` → `auth.signOut()` → `redirect`). A Server Action
POSTs to the URL of the page it's rendered on, so the profile-menu sign-out posts to **`/dashboard`**
— straight through `proxy.ts`. The Neon `auth.middleware` returns a `NextResponse.redirect(loginUrl)`
when it decides a session is missing; a **redirect response on a Server Action POST** makes the
client throw *"An unexpected response was received from the server."* (the sign-out crash).

**Fix (`proxy.ts`):** wrap the guard and short-circuit to `NextResponse.next()` when the request
carries the `Next-Action` header. Server Actions already self-authenticate (`getServerUserId`
redirects when there's no session), so skipping the route guard for them is safe and is the
Next-recommended pattern. Normal `/dashboard` GETs are still guarded.

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
| `lib/auth/client.ts` | `createAuthClient()` → browser `authClient` |
| `lib/auth/actions.ts` | `signOutAction()` server action (`auth.signOut()` → redirect) |
| `lib/auth/current-user.ts` | `getSessionUser` / `getServerUserId` / `getUserId` / `ensureLocalUser` |
| `lib/server/users.ts` | `ensureUser({id,email,name})` upsert into `public.users` |
| `app/api/auth/[...path]/route.ts` | `export const { GET, POST } = auth.handler()` |
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

## Testing notes

- `npm run dev` (port 3100), open `/auth/sign-up`, create an account, enter the emailed code, land on
  `/dashboard`. Sign out from the profile menu → redirected to `/auth/sign-in`.
- Without the Console email/Google setup above, sign-up still creates the user but the code email and
  the Google button won't function — they're managed-service config, not app code.
- The future **extension/API JWT path** can verify the Neon Auth JWT via the JWKS endpoint
  (`<NEON_AUTH_BASE_URL>/.well-known/jwks.json`); out of scope here (webapp only).
