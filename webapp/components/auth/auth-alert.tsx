"use client"

import { CheckCircle2, TriangleAlert } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

/**
 * The inline feedback banner for the auth forms — a single place so error and success messages
 * look and animate identically across sign-in / sign-up / verify. Renders nothing when there's no
 * message, and slides + fades in when one appears (tw-animate-css). See docs/AUTH.md.
 */
export function AuthAlert({
  message,
  tone = "error",
  className,
}: {
  message: string | null
  tone?: "error" | "success"
  className?: string
}) {
  if (!message) return null
  const isError = tone === "error"
  const Icon = isError ? TriangleAlert : CheckCircle2
  return (
    <Alert
      // key on the message so a *new* message replays the entrance animation
      key={message}
      variant={isError ? "destructive" : "default"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "animate-in fade-in slide-in-from-top-2 duration-300",
        !isError && "text-emerald-700 *:[svg]:text-emerald-600",
        className,
      )}
    >
      <Icon className="size-4" />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  )
}
