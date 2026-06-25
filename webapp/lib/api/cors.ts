import { env } from "@/lib/env"

/**
 * CORS for a backend shared by the web app and the Chrome extension.
 *
 * The extension makes cross-origin `fetch` calls from a `chrome-extension://<id>`
 * origin, so the API must echo an explicit `Access-Control-Allow-Origin` (a
 * wildcard is not allowed once credentials are involved).
 *
 * Allowed origins come from the ALLOWED_ORIGINS env var (comma-separated). In
 * development we also allow any `chrome-extension://` origin so the unpacked
 * extension's changing id doesn't block testing. Lock this down for production by
 * listing the published extension id in ALLOWED_ORIGINS.
 */
function allowedOrigins(): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

function isOriginAllowed(origin: string | null): origin is string {
  if (!origin) return false
  if (allowedOrigins().includes(origin)) return true
  if (
    env.NODE_ENV === "development" &&
    origin.startsWith("chrome-extension://")
  ) {
    return true
  }
  return false
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isOriginAllowed(origin)) return {}
  // `x-user-id` is the dev-only auth seam (see lib/auth/current-user.ts). Only
  // advertise it cross-origin outside production so it can never be exploited
  // from a browser once real session/JWT auth is in place.
  const allowHeaders =
    env.NODE_ENV === "production"
      ? "Content-Type, Authorization"
      : "Content-Type, Authorization, x-user-id"
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}
