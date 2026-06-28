import "server-only"

import { createNeonAuth } from "@neondatabase/auth/next/server"

import { env } from "@/lib/env"

/**
 * The single server-side Neon Auth (Better Auth) instance — see docs/AUTH.md.
 *
 * Exposes everything the server needs from one object:
 *   - `auth.handler()`     — the /api/auth/[...path] proxy to the Neon Auth service
 *   - `auth.middleware()`  — route protection (proxy.ts)
 *   - `auth.getSession()`  — read the current session in RSCs / route handlers / actions
 *   - `auth.signOut()`, `auth.signIn.*`, `auth.signUp.*` — server-side auth methods
 *
 * The browser never talks to Neon Auth directly: client calls go through the same-origin
 * `/api/auth` handler, so cookies "just work" and there's no CORS. `cookies.sameSite: "lax"`
 * keeps the session cookie present on the top-level OAuth return navigation (Google), while
 * still not riding arbitrary cross-site requests.
 */
export const auth = createNeonAuth({
  baseUrl: env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: env.NEON_AUTH_COOKIE_SECRET!,
    sameSite: "lax",
  },
})
