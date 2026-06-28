"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { authClient } from "@/lib/auth/client"
import { authErrorMessage } from "@/lib/auth/errors"
import { AuthAlert } from "@/components/auth/auth-alert"
import { LabeledDivider } from "@/components/auth/auth-shell"
import { GoogleButton } from "@/components/auth/google-button"

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    // The Neon Auth client THROWS on failure (it doesn't return `{ error }`) — so this must be
    // wrapped, or the button hangs and no message shows. See lib/auth/errors.ts + docs/AUTH.md.
    try {
      await authClient.signIn.email({ email, password })
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't sign in. Please try again."))
      setPending(false)
      return
    }
    // Full reload of server data so the dashboard renders for the new session. Keep the button in
    // its pending state through the navigation (don't reset — success leaves this screen).
    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <GoogleButton label="Continue with Google" />
      <LabeledDivider>or</LabeledDivider>

      <AuthAlert message={error} />

      <FieldGroup>
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
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" disabled={pending || !email || !password}>
        {pending && <Spinner data-icon="inline-start" />}
        Sign in
      </Button>
    </form>
  )
}
