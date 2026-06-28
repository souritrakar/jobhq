import { NextResponse, type NextRequest } from "next/server"

import { auth } from "@/lib/auth/server"

/**
 * Route-protection middleware (Next.js 16 names this `proxy.ts`, not `middleware.ts`).
 *
 * Guards the dashboard: a request to any `/dashboard/*` URL without a valid session is
 * redirected to the sign-in page, so cold links / bookmarks / shared URLs can't reach
 * authenticated screens. The matcher deliberately covers ONLY `/dashboard` — the landing
 * page (`/`), the auth pages (`/auth/*`), and the API (`/api/*`, including the `/api/auth`
 * proxy and the extension's CRUD routes) stay outside it. See docs/AUTH.md.
 */
const guard = auth.middleware({
  loginUrl: "/auth/sign-in",
})

export default function proxy(request: NextRequest) {
  // A Server Action POSTs to the URL of the page it's rendered on, so the sign-out action fired
  // from the profile menu posts to `/dashboard` and passes through this guard. If the guard returns
  // a *redirect* for that POST, the Server Action client can't parse it and throws "An unexpected
  // response was received from the server." (the sign-out crash). Server Actions already run their
  // own server-side auth (e.g. `getServerUserId` redirects when there's no session), so let action
  // requests — identified by the `Next-Action` header — through untouched. See docs/AUTH.md.
  if (request.headers.get("next-action")) return NextResponse.next()
  return guard(request)
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
