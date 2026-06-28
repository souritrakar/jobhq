import { auth } from "@/lib/auth/server"

/**
 * The Neon Auth proxy. Every browser-side auth call (sign-in, sign-up, OTP, OAuth, session)
 * is routed here and forwarded to the managed Neon Auth service, so the browser only ever
 * talks same-origin. See docs/AUTH.md.
 */
export const { GET, POST } = auth.handler()
