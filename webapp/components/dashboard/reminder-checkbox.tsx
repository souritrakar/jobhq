"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A circular checkbox in the Todoist tradition: an empty ring at rest, filling with fern and a
 * check when done. Shared by the global Reminders feed and the per-job rail card so completing a
 * reminder looks and behaves the same everywhere. (There's no checkbox primitive in the kit yet.)
 */
export function ReminderCheckbox({
  checked,
  onToggle,
  title,
}: {
  checked: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
      onClick={onToggle}
      className={cn(
        "grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input text-transparent hover:border-primary/60 hover:bg-primary/5",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  )
}
