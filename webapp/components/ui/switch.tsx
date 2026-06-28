"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * Token-styled wrapper over Base UI's Switch. Base UI gives us the controlled
 * `checked`/`onCheckedChange` API, keyboard support, and `data-[checked]` state hooks.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 transition-colors",
        "bg-input data-[checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none size-4 rounded-full bg-card shadow-sm transition-transform",
          "data-[checked]:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
