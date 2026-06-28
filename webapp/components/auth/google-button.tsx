"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authClient } from "@/lib/auth/client"

/** The multicolor Google "G" — a brand mark, so it keeps its own colors (not currentColor). */
function GoogleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.46h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.73Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3a7.2 7.2 0 0 1-10.78-3.77H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.32a7.2 7.2 0 0 1 0-4.63v-3.1H1.28a12 12 0 0 0 0 10.82l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.99 11.99 0 0 0 1.28 6.59l4.01 3.1A7.2 7.2 0 0 1 12 4.77Z"
      />
    </svg>
  )
}

/**
 * "Continue with Google" — starts the OAuth flow via the client SDK, which redirects the browser
 * to Google and back to `/dashboard`. The button stays in its loading state through the redirect;
 * it only resets if the call returns (i.e. it failed to start).
 */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
    } catch {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? <Spinner data-icon="inline-start" /> : <GoogleIcon data-icon="inline-start" />}
      {label}
    </Button>
  )
}
