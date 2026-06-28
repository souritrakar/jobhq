import { cn } from "@/lib/utils"

// Lightweight form label matching the input/field treatment.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium text-foreground select-none",
        "has-disabled:opacity-50 peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Label }
