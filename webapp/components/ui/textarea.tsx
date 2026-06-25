import { cn } from "@/lib/utils"

// Multi-line text input matching the Input primitive's focus-ring treatment and token radii.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xs transition-colors",
        "placeholder:text-muted-foreground field-sizing-content",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
