import type { ReactNode } from "react"
import Link from "next/link"

import { Separator } from "@/components/ui/separator"
import { Logo } from "@/components/landing/logo"

/**
 * Shared chrome for the public auth screens — the brand lockup, a centered heading, the card that
 * holds the form, and a switch-link footer. Keeps sign-in and sign-up visually identical and on the
 * warm-paper surface so the auth flow reads as the same product as the dashboard.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <Link href="/" aria-label="JobTracker home">
          <Logo />
        </Link>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>

      <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>
    </div>
  )
}

/** A horizontal rule with centered label ("or") — used between OAuth and the email form. */
export function LabeledDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs font-medium text-muted-foreground">{children}</span>
      <Separator className="flex-1" />
    </div>
  )
}
