"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { authClient } from "@/lib/auth/client"
import { authErrorMessage } from "@/lib/auth/errors"
import { AuthAlert } from "@/components/auth/auth-alert"
import { LabeledDivider } from "@/components/auth/auth-shell"
import { GoogleButton } from "@/components/auth/google-button"

// On SUCCESS the Neon Auth client resolves to `{ data, error: null }` (it only *throws* on
// failure — see lib/auth/errors.ts). Unwrap to the inner payload (`{ token, user, session }`),
// tolerating an already-unwrapped shape.
function payloadOf(result: unknown): { user?: { emailVerified?: boolean }; session?: unknown } {
  const r = result as { data?: unknown } | null
  return (r && typeof r === "object" && "data" in r ? r.data : result) as never
}

// Does the result carry a live session (auto sign-in after verify)?
function hasSession(result: unknown): boolean {
  const d = payloadOf(result)
  return Boolean(d?.session ?? d?.user)
}

export function SignUpForm() {
  const router = useRouter()
  const [step, setStep] = useState<"form" | "verify">("form")

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [resent, setResent] = useState(false)

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    // The Neon Auth client THROWS on failure (e.g. the email already exists) — wrap it, or the
    // button hangs with no message. See lib/auth/errors.ts + docs/AUTH.md.
    let data: unknown
    try {
      data = await authClient.signUp.email({ name, email, password })
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't create your account. Please try again."))
      setPending(false)
      return
    }
    // With "verify at sign-up" on, the user isn't verified yet and a code has been emailed —
    // move to the code step. If verification is off, sign-up already established a session.
    const verified = payloadOf(data).user?.emailVerified
    setPending(false)
    if (verified === false) {
      setStep("verify")
    } else {
      router.replace("/dashboard")
      router.refresh()
    }
  }

  async function verify() {
    if (code.length !== 6 || pending) return
    setError(null)
    setPending(true)
    let data: unknown
    try {
      data = await authClient.emailOtp.verifyEmail({ email, otp: code })
    } catch (err) {
      setError(authErrorMessage(err, "That code is invalid or expired."))
      setCode("")
      setPending(false)
      return
    }
    // verifyEmail auto-signs-in by default; otherwise fall back to the sign-in screen.
    if (hasSession(data)) {
      router.replace("/dashboard")
    } else {
      router.replace("/auth/sign-in")
    }
    router.refresh()
  }

  async function resend() {
    setError(null)
    setResent(false)
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
      setResent(true)
    } catch {
      setError("Couldn't resend the code. Try again in a moment.")
    }
  }

  if (step === "verify") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void verify()
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1 text-center">
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code we sent to
          </p>
          <p className="text-sm font-medium text-foreground">{email}</p>
        </div>

        <AuthAlert message={error} />

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={() => void verify()}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoFocus
            disabled={pending}
            aria-label="Verification code"
          >
            <InputOTPGroup className="gap-1.5 *:rounded-md *:border-l *:size-11 *:text-base">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
          {pending && <Spinner data-icon="inline-start" />}
          Verify email
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("form")
              setCode("")
              setError(null)
            }}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Change details
          </button>
          <button
            type="button"
            onClick={() => void resend()}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {resent ? "Code sent" : "Resend code"}
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={onSignUp} className="flex flex-col gap-4">
      <GoogleButton label="Sign up with Google" />
      <LabeledDivider>or</LabeledDivider>

      <AuthAlert message={error} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>At least 8 characters.</FieldDescription>
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        className="w-full"
        disabled={pending || !name || !email || password.length < 8}
      >
        {pending && <Spinner data-icon="inline-start" />}
        Create account
      </Button>
    </form>
  )
}
