"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * A small hover/focus tooltip built on Base UI. Wrap a single focusable element (it becomes the
 * trigger) and pass its `label`. Used to give icon-only buttons a text label on hover without
 * spending toolbar space on visible captions. The trigger element is rendered via Base UI's
 * `render` prop, so it composes with other triggers (e.g. a Popover trigger) on the same element.
 */
export function Tooltip({
  label,
  children,
  side = "bottom",
  delay = 250,
}: {
  label: string
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
}) {
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-50">
            <TooltipPrimitive.Popup
              className={cn(
                "rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md",
                "origin-(--transform-origin) transition-[opacity,transform] duration-100 ease-out",
                "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
                "motion-reduce:transition-none",
              )}
            >
              {label}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
