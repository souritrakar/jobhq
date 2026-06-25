import { cn } from "@/lib/utils"

// Minimal surface primitive — a paper card on the warm background. Composed by
// the dashboard's stat tiles, job cards, and panels.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-md border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Card }
