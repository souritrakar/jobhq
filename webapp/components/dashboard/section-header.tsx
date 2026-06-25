import type { ReactNode } from "react"

// A quiet section header: a small, confident label with an optional right-aligned action.
// Deliberately understated (text-sm) so the page's one greeting stays the dominant type;
// section labels and card titles recede beneath it.
export function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}
