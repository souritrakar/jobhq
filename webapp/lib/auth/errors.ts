/**
 * Friendly auth error copy — see docs/AUTH.md.
 *
 * IMPORTANT: the Neon Auth (Better Auth) *client* methods (`authClient.signIn.email`,
 * `signUp.email`, `emailOtp.verifyEmail`, …) **throw** an `AuthApiError` on failure — they do
 * NOT resolve to `{ data, error }` like vanilla Better Auth. So every call site must wrap the
 * call in `try/catch` and run the thrown value through `authErrorMessage`, otherwise the form's
 * pending state never resets (the button hangs) and no message is shown.
 *
 * The thrown error carries a normalized snake_case `code` (e.g. `invalid_credentials`,
 * `user_already_exists`) plus a `message` and HTTP `status`. We map the stable codes to our own
 * security-conscious copy and fall back to the SDK message, then a context fallback.
 */

type AuthErrorShape = { code?: string; message?: string; status?: number }

function read(err: unknown): AuthErrorShape {
  if (err && typeof err === "object") {
    const e = err as AuthErrorShape
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
      status: typeof e.status === "number" ? e.status : undefined,
    }
  }
  return {}
}

const COPY = {
  invalidCredentials: "Incorrect email or password. Please try again.",
  userNotFound: "We couldn't find an account with that email.",
  userAlreadyExists: "An account with this email already exists. Try signing in instead.",
  emailNotVerified: "Your email isn't verified yet. Check your inbox for the verification code.",
  weakPassword: "Please choose a stronger password (at least 8 characters).",
  emailInvalid: "That email address doesn't look valid.",
  rateLimited: "Too many attempts. Please wait a moment and try again.",
} as const

// Stable codes the Neon adapter normalizes Better Auth errors to (its `AuthErrorCode`). At
// sign-in, a missing account and a wrong password BOTH surface as `invalid_credentials` on
// purpose (no account enumeration), so we can't — and shouldn't — distinguish them there.
const BY_CODE: Record<string, string> = {
  invalid_credentials: COPY.invalidCredentials,
  user_not_found: COPY.userNotFound,
  user_already_exists: COPY.userAlreadyExists,
  email_not_confirmed: COPY.emailNotVerified,
  weak_password: COPY.weakPassword,
  email_address_invalid: COPY.emailInvalid,
  over_request_rate_limit: COPY.rateLimited,
}

// Fallback by message text. The adapter sometimes normalizes via HTTP status (e.g. Better Auth's
// `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` → 422 → `validation_failed`), losing the specific code —
// so we also pattern-match the human message to recover the right copy.
const BY_MESSAGE: [RegExp, string][] = [
  [/already exists|already registered|use another email/i, COPY.userAlreadyExists],
  [/not verified|verify your email|email.*not confirmed/i, COPY.emailNotVerified],
  [/invalid email or password|incorrect (email|password)/i, COPY.invalidCredentials],
  [/too many|rate limit/i, COPY.rateLimited],
  [/password.*(short|long|weak|8 characters)/i, COPY.weakPassword],
]

/** Map a thrown auth error to friendly copy. `fallback` is shown for unknown / network errors. */
export function authErrorMessage(err: unknown, fallback: string): string {
  const { code, message } = read(err)
  if (code && BY_CODE[code]) return BY_CODE[code]
  if (message) {
    for (const [pattern, copy] of BY_MESSAGE) if (pattern.test(message)) return copy
  }
  // A bare network failure throws a generic Error ("Failed to fetch") with no useful code —
  // prefer our friendly fallback over leaking that.
  if (!code && (!message || /failed to fetch|network|load failed/i.test(message))) return fallback
  return message || fallback
}
