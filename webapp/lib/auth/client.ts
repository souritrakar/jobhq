"use client"

import { createAuthClient } from "@neondatabase/auth/next"

/**
 * The browser-side Neon Auth client — see docs/AUTH.md. Drives the auth forms' interactive
 * flows (sign-up, OTP verification, Google OAuth, sign-out feedback). With no arguments it
 * targets the same-origin `/api/auth` proxy, so the session cookie is sent automatically.
 *
 * Mirrors the server `auth` instance's methods:
 *   authClient.signUp.email({ name, email, password })
 *   authClient.signIn.email({ email, password })
 *   authClient.signIn.social({ provider: "google", callbackURL })
 *   authClient.emailOtp.verifyEmail({ email, otp }) / sendVerificationOtp({ email, type })
 *   authClient.getSession() / signOut()
 */
export const authClient = createAuthClient()
