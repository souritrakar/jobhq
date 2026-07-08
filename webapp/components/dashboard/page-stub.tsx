import Link from "next/link"
import { ArrowRight, Check, Sparkles, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

// Large "Coming soon" surface for not-yet-built tabs. Keeps navigation working
// end-to-end while previewing what the feature will do — and nudges users to the
// one resume tool that is live today (the cover letter generator).
export function PageStub({
  title,
  description,
  icon: Icon,
  hint,
  features,
}: {
  title: string
  description: string
  icon: LucideIcon
  hint: string
  // What the user will be able to do once this ships. Rendered as a preview checklist.
  features?: string[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <Card className="border-dashed px-6 py-16 sm:px-12 sm:py-20">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          {/* Flat accent tile — no gradient, no glow: the page header already names the feature,
              so the card leads with the mark + the "coming soon" signal, not a second title. */}
          <span className="grid size-16 place-items-center rounded-2xl bg-accent text-accent-foreground">
            <Icon className="size-8" />
          </span>

          <Badge variant="accent" className="mt-6 px-3 py-1 text-xs font-medium">
            <Sparkles />
            Coming soon
          </Badge>

          <p className="mt-4 max-w-md text-base font-medium text-foreground">{hint}</p>

          {features && features.length > 0 ? (
            <ul className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-4 py-3 text-sm"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-10 flex flex-col items-center gap-3">
            <Button size="lg" render={<Link href="/dashboard/resume/cover-letter" />}>
              Try the Cover Letter generator
              <ArrowRight data-icon="inline-end" />
            </Button>
            <p className="text-xs text-muted-foreground">
              It&apos;s live now. The rest of the resume suite is on the way.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
