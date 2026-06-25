import type { LucideIcon } from "lucide-react"

import { Card } from "@/components/ui/card"

// Clean placeholder for not-yet-built tabs, so navigation works end-to-end.
export function PageStub({
  title,
  description,
  icon: Icon,
  hint,
}: {
  title: string
  description: string
  icon: LucideIcon
  hint: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-20 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" />
        </span>
        <p className="mt-1 font-medium">Coming soon</p>
        <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      </Card>
    </div>
  )
}
