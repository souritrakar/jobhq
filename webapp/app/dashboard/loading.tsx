// Skeleton for the dashboard while server data resolves — mirrors the real rhythm
// (header → stat strip → row list) so the layout doesn't jump when content arrives.
export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true" aria-label="Loading dashboard">
      <div>
        <div className="h-3.5 w-40 rounded bg-foreground/10" />
        <div className="mt-2 h-8 w-64 rounded-md bg-foreground/10" />
      </div>

      <div className="flex border-y border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 px-6 py-4 first:pl-0 [&+div]:border-l [&+div]:border-border">
            <div className="h-7 w-12 rounded bg-foreground/10" />
            <div className="mt-2.5 h-3 w-16 rounded bg-foreground/10" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-4 w-32 rounded bg-foreground/10" />
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="size-9 shrink-0 rounded-[30%] bg-foreground/10" />
              <div className="flex-1">
                <div className="h-3.5 w-48 rounded bg-foreground/10" />
                <div className="mt-2 h-3 w-32 rounded bg-foreground/10" />
              </div>
              <div className="h-5 w-16 rounded-full bg-foreground/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
