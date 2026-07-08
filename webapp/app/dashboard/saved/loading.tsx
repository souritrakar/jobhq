// Skeleton for the Saved jobs page — mirrors the real rhythm (title → search/filter toolbar →
// card grid) so the page doesn't jump when the list arrives. Without this, navigation here fell
// back to the dashboard-home skeleton (greeting + stat strip), the wrong geometry entirely.
export default function SavedJobsLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading saved jobs">
      <div className="h-7 w-40 rounded-md bg-foreground/10" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-9 w-full max-w-xs rounded-md bg-foreground/10" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-64 rounded-md bg-foreground/10" />
          <div className="h-9 w-28 rounded-md bg-foreground/10" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-start gap-3">
              <div className="size-9 shrink-0 rounded-[30%] bg-foreground/10" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-4/5 rounded bg-foreground/10" />
                <div className="mt-2 h-3 w-2/5 rounded bg-foreground/10" />
              </div>
            </div>
            <div className="mt-4 h-3.5 w-1/2 rounded bg-foreground/10" />
            <div className="mt-4 flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-foreground/10" />
              <div className="h-3 w-12 rounded bg-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
