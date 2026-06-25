"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * A minimal dropdown menu: the caller renders the trigger (so it stays a real, focusable
 * button with correct aria), and the panel content via a render-prop that receives `close`.
 * Dismisses on outside-click and Escape. Deliberately small — the detail page only needs a
 * status picker and an overflow menu, not a full combobox.
 */
export function Menu({
  renderTrigger,
  children,
  align = "end",
  panelClassName,
}: {
  renderTrigger: (api: { open: boolean; toggle: () => void }) => ReactNode
  children: (api: { close: () => void }) => ReactNode
  align?: "start" | "end"
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {renderTrigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-1.5 min-w-[11rem] origin-top overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg shadow-foreground/[0.06]",
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  )
}

/** One menu row. Quiet by default; `tone="danger"` for destructive actions. */
export function MenuItem({
  onClick,
  children,
  icon: Icon,
  tone = "default",
  selected = false,
}: {
  onClick: () => void
  children: ReactNode
  icon?: LucideLike
  tone?: "default" | "danger"
  selected?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors outline-none",
        tone === "danger"
          ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
          : "text-foreground hover:bg-muted focus-visible:bg-muted",
        selected && "font-medium",
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0 opacity-80" /> : null}
      <span className="flex-1 truncate">{children}</span>
    </button>
  )
}

type LucideLike = React.ComponentType<{ className?: string }>
