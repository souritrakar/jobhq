import type { NextRequest } from "next/server"

import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"

/**
 * Resolve the authenticated user's id for a request.
 *
 * ⚠️ TEMPORARY IMPLEMENTATION — this is the single seam where real auth plugs in.
 * Today it trusts an `x-user-id` header (or falls back to DEV_USER_ID) so CRUD can
 * be exercised from the extension before auth exists. This is NOT secure and must
 * not ship to production as-is.
 *
 * When wiring real auth (e.g. Clerk):
 *   1. Verify the session/JWT from the request here.
 *   2. Return the verified user id (and throw ApiError.unauthorized() otherwise).
 * Every route already calls this, so nothing downstream changes.
 */
export function getUserId(req: NextRequest): string {
  // The spoofable `x-user-id` header is a dev-only seam — never honor it in
  // production, even by accident, so this stub can't become a prod auth bypass.
  if (env.NODE_ENV !== "production") {
    const headerUserId = req.headers.get("x-user-id")?.trim()
    if (headerUserId) return headerUserId
    if (env.DEV_USER_ID) return env.DEV_USER_ID
  }

  throw ApiError.unauthorized()
}

/**
 * Server-component counterpart to `getUserId`. Server components render without a
 * `NextRequest`, so there's no `x-user-id` header to read — in development we resolve
 * to DEV_USER_ID. When real auth lands, read the session here (e.g. Clerk's `auth()`).
 */
export function getServerUserId(): string {
  if (env.NODE_ENV !== "production" && env.DEV_USER_ID) {
    return env.DEV_USER_ID
  }
  throw ApiError.unauthorized()
}
