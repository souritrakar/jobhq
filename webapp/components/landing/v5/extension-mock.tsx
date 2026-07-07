import { cn } from "@/lib/utils";
import { Icon } from "../dashboard-mock";

/* Faithful abstract mock of the extension's slide-in drawer — header
   ("Save to tracker"), segmented Details/Application/Resume tabs, auto-filled
   identity + property rows, and the fixed status + save bar. Simplified, but
   every label is the real product string. */

export function ExtensionMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-[16.5rem] overflow-hidden rounded-2xl border border-border bg-background shadow-[0_36px_80px_-36px_rgba(20,40,25,0.55)]",
        className,
      )}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="grid size-6 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Icon.Check className="size-3.5" />
        </span>
        <p className="flex-1 text-[0.8rem] font-semibold text-foreground">Save to tracker</p>
        <Icon.ChevronRight className="size-3.5 text-muted-foreground/60" />
        <Icon.Close className="size-3.5 text-muted-foreground/60" />
      </div>

      {/* tabs — real segmented-control styling, no green fill */}
      <div className="mx-3.5 mt-3 grid grid-cols-3 gap-1 rounded-full bg-secondary p-1">
        <span className="rounded-full bg-background py-1 text-center text-[0.66rem] font-semibold text-foreground shadow-sm">
          Details
        </span>
        <span className="py-1 text-center text-[0.66rem] font-medium text-muted-foreground">
          Application
        </span>
        <span className="py-1 text-center text-[0.66rem] font-medium text-muted-foreground">
          Resume
        </span>
      </div>

      {/* auto-filled banner */}
      <div className="mx-3.5 mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-fern-50 px-2.5 py-2">
        <Icon.Spark className="size-3.5 shrink-0 text-primary" />
        <p className="text-[0.68rem] font-semibold text-foreground">Auto-filled from this page</p>
        <Icon.Check className="ml-auto size-3.5 shrink-0 text-primary" />
      </div>

      {/* identity */}
      <div className="px-3.5 pt-3">
        <p className="text-[0.92rem] font-bold leading-tight text-foreground">
          Senior Frontend Engineer
        </p>
        <p className="mt-0.5 text-[0.72rem] text-muted-foreground">Linear</p>
      </div>

      {/* property rows */}
      <div className="mt-2.5 space-y-1 px-3.5 text-[0.7rem]">
        {[
          { label: "Location", value: "Remote · North America" },
          { label: "Salary", value: "$170k–210k" },
          { label: "Deadline", value: "Friday, Jul 10", warm: true },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 rounded-lg py-1">
            <span className="w-16 shrink-0 text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "truncate font-medium",
                row.warm ? "text-[var(--tint-butter-ink)]" : "text-foreground",
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* chips */}
      <div className="mt-2 flex flex-wrap gap-1 px-3.5">
        {["Full-time", "Remote", "React", "TypeScript"].map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-secondary px-2 py-0.5 text-[0.62rem] font-medium text-muted-foreground"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* status + save bar */}
      <div className="mt-3.5 border-t border-border bg-card px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[0.68rem] font-medium text-muted-foreground">Status</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[0.66rem] font-semibold text-muted-foreground">
            <span className="size-1.5 rounded-full bg-current" />
            Saved
            <Icon.ChevronRight className="size-2.5 rotate-90 opacity-60" />
          </span>
        </div>
        <div className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-[0.74rem] font-semibold text-primary-foreground shadow-[0_8px_18px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)]">
          <Icon.Check className="size-3.5" /> Save application
        </div>
      </div>
    </div>
  );
}
