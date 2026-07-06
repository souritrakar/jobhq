import { cn } from "@/lib/utils";
import { BrandLogo } from "../brand-logo";
import { Icon } from "../dashboard-mock";

/* Faithful abstract mock of the real dashboard home — sidebar (Home / Jobs /
   Reminders / Documents / Settings), greeting, stat strip, "Recently saved"
   rows with genuine status pills. Wrapped in a light browser frame so the
   extension drawer can visibly belong to the same window. */

const NAV = [
  { label: "Home", active: true, icon: Icon.Home },
  { label: "Jobs", icon: Icon.Bookmark },
  { label: "Reminders", icon: Icon.Bell, badge: 2 },
  { label: "Documents", icon: Icon.File },
  { label: "Settings", icon: Icon.Gear },
];

type Row = {
  slug: string;
  co: string;
  role: string;
  meta: string;
  salary?: string;
  when: string;
  status?: "applied" | "interviewing" | "offer";
  statusLabel?: string;
};

/* Literal class strings — Tailwind can't see dynamic `bg-status-${x}`. */
const STATUS_PILL: Record<NonNullable<Row["status"]>, string> = {
  applied: "bg-status-applied text-status-applied-foreground",
  interviewing: "bg-status-interviewing text-status-interviewing-foreground",
  offer: "bg-status-offer text-status-offer-foreground",
};

const ROWS: Row[] = [
  {
    slug: "linear",
    co: "Linear",
    role: "Senior Frontend Engineer",
    meta: "Remote · LinkedIn",
    salary: "$170–210k",
    when: "2h ago",
    status: "interviewing",
    statusLabel: "Interviewing",
  },
  {
    slug: "mercury",
    co: "Mercury",
    role: "Backend Engineer",
    meta: "NYC · Greenhouse",
    salary: "$185k",
    when: "1d ago",
    status: "applied",
    statusLabel: "Applied",
  },
  {
    slug: "runway",
    co: "Runway",
    role: "AI Product Engineer",
    meta: "Remote · Wellfound",
    when: "2d ago",
  },
  {
    slug: "notion",
    co: "Notion",
    role: "Product Engineer, Growth",
    meta: "SF · Company site",
    salary: "$160–195k",
    when: "3d ago",
    status: "offer",
    statusLabel: "Offer",
  },
];

export function AppMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_90px_-45px_rgba(20,40,25,0.5)]",
        className,
      )}
    >
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-3.5 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#f6bdb6]" />
          <span className="size-2.5 rounded-full bg-[#f4dcae]" />
          <span className="size-2.5 rounded-full bg-[#bcd9bf]" />
        </span>
        <div className="mx-auto flex h-6 w-56 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-[0.64rem] text-muted-foreground">
          <Icon.Lock className="size-2.5 text-muted-foreground/60" />
          app.jobtracker.com
        </div>
        <span className="grid size-5 place-items-center rounded-md bg-primary/10">
          <Icon.Puzzle className="size-3 text-primary" />
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[9.5rem_1fr]">
        {/* sidebar */}
        <aside className="hidden flex-col border-r border-border bg-background/60 p-2.5 sm:flex">
          <div className="flex items-center gap-1.5 px-1.5 pb-2.5">
            <span className="grid size-5 place-items-center rounded-md bg-primary text-[0.58rem] font-bold text-primary-foreground">
              J
            </span>
            <span className="text-[0.74rem] font-semibold tracking-[-0.01em] text-foreground">
              JobTracker
            </span>
          </div>
          <div className="mb-2 flex items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-[0.66rem] font-semibold text-primary-foreground">
            <Icon.Plus className="size-3" /> Save a job
          </div>
          {NAV.map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.7rem] font-medium",
                item.active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <item.icon className={cn("size-3.5", item.active && "text-primary")} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="grid size-4 place-items-center rounded-full bg-primary text-[0.56rem] font-bold text-primary-foreground">
                  {item.badge}
                </span>
              )}
            </div>
          ))}
        </aside>

        {/* home */}
        <main className="min-w-0 p-4">
          <p className="text-[0.62rem] text-muted-foreground">Monday, July 6</p>
          <h3 className="mt-0.5 font-display text-[1.05rem] font-semibold tracking-[-0.015em] text-foreground">
            Good morning, Sam
          </h3>

          {/* stat strip */}
          <div className="mt-3 flex items-center gap-4 border-y border-border/70 py-2.5">
            {[
              { n: 23, label: "Saved" },
              { n: 12, label: "Applied" },
              { n: 4, label: "Interviewing" },
            ].map((s, i) => (
              <div key={s.label} className={cn("flex items-baseline gap-1.5", i > 0 && "border-l border-border/70 pl-4")}>
                <span className="text-[1rem] font-bold tabular-nums text-foreground">{s.n}</span>
                <span className="text-[0.64rem] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {/* recently saved */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[0.72rem] font-semibold text-foreground">Recently saved</p>
            <span className="inline-flex items-center gap-1 text-[0.64rem] font-medium text-muted-foreground">
              View all <Icon.Arrow className="size-2.5" />
            </span>
          </div>
          <div className="mt-1.5 divide-y divide-border/60 rounded-xl border border-border/70 bg-background">
            {ROWS.map((r) => (
              <div key={r.role} className="flex items-center gap-2.5 px-2.5 py-2">
                <BrandLogo slug={r.slug} label={r.co} className="size-6" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[0.72rem] font-semibold leading-tight text-foreground">
                      {r.role}
                    </p>
                    {r.status && (
                      <span
                        className={cn(
                          "hidden shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[0.56rem] font-semibold md:inline-flex",
                          STATUS_PILL[r.status],
                        )}
                      >
                        <span className="size-1 rounded-full bg-current" />
                        {r.statusLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-px truncate text-[0.62rem] text-muted-foreground">
                    {r.co} · {r.meta}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {r.salary && (
                    <p className="text-[0.64rem] font-semibold tabular-nums text-fern-700">{r.salary}</p>
                  )}
                  <p className="text-[0.58rem] text-muted-foreground/80">{r.when}</p>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
