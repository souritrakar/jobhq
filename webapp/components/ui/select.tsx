"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Token-styled wrapper over Base UI's Select, matching the input/button treatment
 * (radii, border, focus ring) and the design-system surface. Base UI handles the
 * listbox semantics, keyboard navigation, scroll lock, and enter/exit transitions
 * via `data-[starting-style]`/`data-[ending-style]`.
 */

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-sm shadow-xs transition-colors",
        "data-[placeholder]:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="truncate text-left">{children}</span>
      <SelectPrimitive.Icon className="text-muted-foreground">
        <ChevronsUpDown className="size-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={6} className="z-50 outline-none">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-border bg-card p-1 text-foreground shadow-lg outline-none",
            "transition-[opacity,transform] duration-150 ease-out",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            "motion-reduce:scale-100 motion-reduce:transition-none",
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
        "data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center text-primary">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem }
