// Skeleton for the Reminders page — mirrors the real rhythm (title + summary → filter control →
// grouped feed) so the layout holds still while the feed resolves, instead of borrowing the
// dashboard-home skeleton's unrelated geometry.
export default function RemindersLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading reminders">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="h-7 w-36 rounded-md bg-foreground/10" />
          <div className="mt-2 h-3.5 w-48 rounded bg-foreground/10" />
        </div>
        <div className="h-8 w-32 rounded-md bg-foreground/10" />
      </div>

      <div className="h-9 w-44 rounded-md bg-foreground/10" />

      <div className="overflow-hidden rounded-xl border border-border/70 bg-sidebar">
        <div className="px-4 pb-2 pt-4">
          <div className="h-3 w-16 rounded bg-foreground/10" />
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3.5">
              <div className="mt-0.5 size-4.5 shrink-0 rounded-full bg-foreground/10" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/5 rounded bg-foreground/10" />
                <div className="mt-2 h-3 w-2/5 rounded bg-foreground/10" />
              </div>
              <div className="h-5 w-16 shrink-0 rounded-full bg-foreground/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
