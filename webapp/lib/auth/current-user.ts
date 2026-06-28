import "server-only"

import type { NextRequest } from "next/server"
import { redirect } from "next/navigation"

import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import { auth } from "@/lib/auth/server"
import { ensureUser } from "@/lib/server/users"

/**
 * The auth seam — the single place request → user-id resolution happens (see docs/AUTH.md).
 *
 * The webapp authenticates with Neon Auth (Better Auth). Both resolvers are async because
 * reading the session is async. On the way through, the authenticated identity is bridged into
 * our local `users` table (`ensureLocalUser`) so downstream `userId` foreign keys are satisfied.
 */

/** The fields we read off a Neon Auth session user. */
export type SessionUser = {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: boolean
}

// Neon Auth's getSession() returns the session under `data`; the user hangs off it. Read it
// defensively (different SDK paths nest it as `data.user` or `data.session.user`).
type RawUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
  emailVerified?: boolean
}

function readSessionUser(data: unknown): SessionUser | null {
  const d = data as { user?: RawUser; session?: { user?: RawUser } } | null
  const u = d?.user ?? d?.session?.user
  if (!u?.id) return null
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    image: u.image ?? null,
    emailVerified: Boolean(u.emailVerified),
  }
}

// Per-process memo: upsert the local users row at most once per cold start per user, instead of
// on every request. Serverless cold starts reset this (re-syncing email/name), which is fine.
const ensured = new Set<string>()

async function ensureLocalUser(user: SessionUser): Promise<void> {
  if (ensured.has(user.id)) return
  await ensureUser({ id: user.id, email: user.email, name: user.name })
  ensured.add(user.id)
}

/**
 * The full authenticated user, for server components that render the dashboard. Redirects to
 * sign-in when there's no session (defensive — the middleware already gates `/dashboard`, but a
 * cold call here should never render an authed screen with no user).
 */
export async function getSessionUser(): Promise<SessionUser> {
  const { data } = await auth.getSession()
  const user = readSessionUser(data)
  if (!user) redirect("/auth/sign-in")
  await ensureLocalUser(user)
  return user
}

/** The authenticated user's id for dashboard server components. */
export async function getServerUserId(): Promise<string> {
  return (await getSessionUser()).id
}

/**
 * The current user if signed in, or null — WITHOUT redirecting or bridging. For the public auth
 * pages, which redirect already-signed-in users to the dashboard themselves.
 */
export async function getOptionalSessionUser(): Promise<SessionUser | null> {
  const { data } = await auth.getSession()
  return readSessionUser(data)
}

/**
 * The authenticated user's id for API route handlers. Prefers the Neon Auth session (the
 * webapp, via its cookie). Falls back — non-production only — to the spoofable `x-user-id`
 * header / `DEV_USER_ID` so the extension and curl can still exercise CRUD until the extension
 * gets its own auth. Throws `ApiError.unauthorized()` otherwise (routes return the JSON envelope;
 * they never redirect).
 */
export async function getUserId(req: NextRequest): Promise<string> {
  const { data } = await auth.getSession()
  const user = readSessionUser(data)
  if (user) {
    await ensureLocalUser(user)
    return user.id
  }

  if (env.NODE_ENV !== "production") {
    const headerUserId = req.headers.get("x-user-id")?.trim()
    if (headerUserId) return headerUserId
    if (env.DEV_USER_ID) return env.DEV_USER_ID
  }

  throw ApiError.unauthorized()
}
