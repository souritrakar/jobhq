import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Small inline label chip. `StatusPill` (components/dashboard) handles pipeline status
// colors; this is the generic chip used for incidental metadata.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        accent: "bg-accent text-accent-foreground",
        warning: "bg-clay-soft text-clay-ink dark:bg-clay/15 dark:text-clay",
        danger: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
