"use client"

import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

// Error boundary for the dashboard segment. The message is in the interface's voice —
// it explains what happened and offers the fix (retry), without apologizing or blaming.
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-card px-6 py-16 text-center">
      <p className="text-sm font-medium">We couldn&apos;t load your dashboard</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Something went wrong on our end. Your saved jobs are safe. Try loading again.
      </p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-1 gap-1.5">
        <RotateCw className="size-3.5" />
        Try again
      </Button>
    </div>
  )
}
