// Skeleton for the job detail page — mirrors the real rhythm (back link → identity header →
// spec bar → sidebar + working column) so the two-column layout doesn't jump into place when
// the job resolves. Matches the page's own geometry instead of the dashboard-home skeleton.
export default function JobDetailLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading job">
      <div className="h-3.5 w-14 rounded bg-foreground/10" />

      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="size-12 shrink-0 rounded-[30%] bg-foreground/10" />
          <div className="min-w-0">
            <div className="h-7 w-72 max-w-full rounded-md bg-foreground/10" />
            <div className="mt-2.5 h-3.5 w-44 rounded bg-foreground/10" />
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <div className="h-8 w-28 rounded-md bg-foreground/10" />
          <div className="size-8 rounded-md bg-foreground/10" />
          <div className="size-8 rounded-md bg-foreground/10" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border/70 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-4 w-28 rounded bg-foreground/10" />
        ))}
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:order-2">
          <div className="h-40 rounded-xl border border-border bg-card" />
          <div className="h-28 rounded-xl border border-border bg-card" />
        </div>
        <div className="flex flex-col gap-4 lg:order-1">
          <div className="h-36 rounded-xl border border-border bg-card" />
          <div className="h-24 rounded-xl border border-border bg-card" />
        </div>
      </div>
    </div>
  )
}
