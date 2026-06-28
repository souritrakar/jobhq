import type { ReactNode } from "react"

/**
 * Public auth shell — a calm, centered surface on the warm-paper background, with none of the
 * dashboard chrome. Wraps both sign-in and sign-up. These routes sit outside the middleware's
 * `/dashboard` matcher, so they're reachable without a session (that's the whole point).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12">
      {children}
    </main>
  )
}
