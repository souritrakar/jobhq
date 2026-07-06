import { BrandLogo } from "./brand-logo";
import { cn } from "@/lib/utils";

/* A realistic mock of the JobTracker app — modelled on simplify.jobs / Linear:
   a status sidebar, a board of saved jobs, and a "Next up" panel. Real company
   logos, clean line icons, restrained noise. This is the hero product shot, and
   it restructures across breakpoints (3-pane → 2-pane → stacked) rather than
   just shrinking. */

type Status = { name: string; count?: number; dot: string; active?: boolean };

const STATUSES: Status[] = [
  { name: "Inbox", count: 3, dot: "bg-muted-foreground/40" },
  { name: "To review", count: 5, dot: "bg-sky-500", active: true },
  { name: "Resume needed", count: 2, dot: "bg-amber-500" },
  { name: "Apply started", count: 4, dot: "bg-primary" },
  { name: "Waiting", count: 6, dot: "bg-violet-500" },
  { name: "Follow up", count: 2, dot: "bg-rose-500" },
  { name: "Archived", dot: "bg-muted-foreground/30" },
];

type Job = {
  slug: string;
  co: string;
  role: string;
  source: string;
  next: string;
  deadline?: string;
  urgent?: boolean;
};

const JOBS: Job[] = [
  {
    slug: "linear",
    co: "Linear",
    role: "Senior Frontend Engineer",
    source: "Saved from LinkedIn",
    next: "Tailor resume",
    deadline: "Friday",
    urgent: true,
  },
  {
    slug: "mercury",
    co: "Mercury",
    role: "Backend Engineer",
    source: "Saved from company site",
    next: "Find referral",
  },
  {
    slug: "runway",
    co: "Runway",
    role: "AI Product Engineer",
    source: "Saved from Wellfound",
    next: "Review requirements",
  },
  {
    slug: "seed",
    co: "Seed-stage startup",
    role: "Founding Engineer",
    source: "Saved from Discord",
    next: "Apply tomorrow",
  },
];

export function DashboardMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_70px_-40px_rgba(20,40,25,0.4)]",
        className,
      )}
    >
      {/* ── Browser chrome ── */}
      <div className="border-b border-border bg-secondary/70">
        <div className="flex items-end gap-1 px-3 pt-2">
          <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-border bg-card px-3 py-1.5">
            <span className="grid size-3.5 place-items-center rounded bg-primary text-[0.5rem] font-bold text-primary-foreground">
              J
            </span>
            <span className="text-[0.7rem] font-medium text-foreground">My job queue</span>
            <Icon.Close className="size-3 text-muted-foreground" />
          </div>
          <Icon.Plus className="mb-1.5 ml-1 size-3.5 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <Icon.ChevronLeft className="size-4 text-muted-foreground/70" />
          <Icon.ChevronRight className="size-4 text-muted-foreground/40" />
          <Icon.Refresh className="size-3.5 text-muted-foreground/70" />
          <div className="flex h-7 flex-1 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground">
            <Icon.Lock className="size-3 text-muted-foreground/60" />
            app.jobtracker.com
          </div>
          <span className="grid size-6 place-items-center rounded-md bg-primary/10">
            <Icon.Puzzle className="size-3.5 text-primary" />
          </span>
        </div>
      </div>

      {/* ── App body: 3-pane → 2-pane → stacked ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_15rem] lg:grid-cols-[10.5rem_1fr_15rem]">
        {/* Sidebar — desktop only */}
        <aside className="hidden flex-col gap-0.5 border-r border-border bg-secondary/30 p-3 lg:flex">
          <div className="flex items-center gap-2 px-1.5 pb-2">
            <span className="grid size-5 place-items-center rounded-md bg-primary text-[0.6rem] font-bold text-primary-foreground">
              J
            </span>
            <span className="font-display text-[0.8rem] font-semibold tracking-[-0.01em] text-foreground">
              My Job Queue
            </span>
          </div>
          {STATUSES.map((s) => (
            <div
              key={s.name}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.72rem] font-medium",
                s.active
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,40,25,0.06)]"
                  : "text-muted-foreground",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", s.dot)} />
              <span className="flex-1 truncate">{s.name}</span>
              {s.count != null && (
                <span className="shrink-0 text-[0.66rem] font-semibold tabular-nums text-muted-foreground/80">
                  {s.count}
                </span>
              )}
            </div>
          ))}
        </aside>

        {/* Board */}
        <main className="min-w-0 p-3.5 sm:p-4">
          {/* header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-sky-500" />
              <h3 className="truncate whitespace-nowrap font-display text-[0.95rem] font-semibold tracking-[-0.01em] text-foreground">
                To review
              </h3>
              <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded bg-secondary px-1 text-[0.6rem] font-semibold text-muted-foreground">
                5
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[0.7rem] font-semibold text-primary-foreground">
              <Icon.Plus className="size-3.5" /> Add job
            </span>
          </div>

          {/* mobile / tablet status strip (replaces sidebar) */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STATUSES.slice(0, 6).map((s) => (
              <span
                key={s.name}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-medium",
                  s.active
                    ? "border-primary/30 bg-fern-50 text-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", s.dot)} />
                {s.name}
                {s.count != null && <span className="tabular-nums opacity-70">{s.count}</span>}
              </span>
            ))}
          </div>

          {/* job cards */}
          <div className="mt-3 flex flex-col gap-2.5">
            {JOBS.map((j) => (
              <article
                key={j.role}
                className="rounded-xl border border-border bg-background p-3 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(20,40,25,0.4)]"
              >
                <div className="flex items-start gap-2.5">
                  <BrandLogo slug={j.slug} label={j.co} className="size-7" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8rem] font-semibold leading-tight text-foreground">
                      {j.role}
                    </p>
                    <p className="mt-0.5 truncate text-[0.66rem] text-muted-foreground">
                      {j.co} · {j.source}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[0.66rem] font-medium text-muted-foreground">
                    <Icon.Arrow className="size-3 shrink-0 text-primary" />
                    <span className="truncate text-foreground">{j.next}</span>
                  </span>
                  {j.deadline && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 text-[0.64rem] font-medium",
                        j.urgent ? "text-amber-700" : "text-muted-foreground",
                      )}
                    >
                      <Icon.Clock className={cn("size-3", j.urgent ? "text-amber-600" : "text-muted-foreground/70")} />
                      {j.deadline}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </main>

        {/* Next up panel */}
        <aside className="border-t border-border bg-secondary/30 p-3.5 md:border-l md:border-t-0">
          <NextUp />
        </aside>
      </div>
    </div>
  );
}

/* ── "Next up" panel — the single most important action, surfaced ── */
function NextUp() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Icon.Spark className="size-3.5 text-sun" />
        <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Next up</p>
      </div>

      <div className="rounded-xl border border-primary/25 bg-card p-3 shadow-[0_10px_30px_-22px_rgba(20,40,25,0.5)]">
        <div className="flex items-center gap-2">
          <BrandLogo slug="linear" label="Linear" className="size-5" />
          <span className="text-[0.7rem] font-semibold text-foreground">Linear</span>
        </div>
        <p className="mt-2 text-[0.82rem] font-semibold leading-snug text-foreground">
          Finish application for Senior Frontend Engineer
        </p>
        <p className="mt-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-amber-700">
          <Icon.Clock className="size-3 text-amber-600" /> Deadline in 2 days
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-800">
            Resume needed
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.62rem] font-medium text-muted-foreground">
            Saved from LinkedIn
          </span>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[0.74rem] font-semibold text-primary-foreground"
        >
          Resume application <Icon.Arrow className="size-3.5" />
        </button>
      </div>

      <div className="hidden md:block">
        <p className="px-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-muted-foreground/70">
          Later today
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {[
            { slug: "mercury", co: "Mercury", task: "Find referral" },
            { slug: "runway", co: "Runway", task: "Review requirements" },
          ].map((r) => (
            <div key={r.co} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
              <BrandLogo slug={r.slug} label={r.co} className="size-4" />
              <span className="truncate text-[0.68rem] font-medium text-foreground">{r.task}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Funnel insight card — small floating summary, kept for reuse ── */
const FUNNEL = [
  { label: "Saved", n: 23, w: "100%", c: "bg-fern-600" },
  { label: "Applied", n: 12, w: "62%", c: "bg-primary" },
  { label: "Interview", n: 4, w: "32%", c: "bg-fern-600/70" },
  { label: "Offer", n: 1, w: "16%", c: "bg-sun" },
];

export function InsightCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-56 rounded-2xl border border-border bg-card p-4 shadow-[0_24px_50px_-24px_rgba(20,40,25,0.45)]",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[0.78rem] font-semibold text-foreground">Your search at a glance</p>
        <Icon.Spark className="size-3.5 text-sun" />
      </div>
      <div className="mt-3 space-y-2">
        {FUNNEL.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[0.66rem] text-muted-foreground">{s.label}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <span className={cn("block h-full rounded-full", s.c)} style={{ width: s.w }} />
            </span>
            <span className="w-5 shrink-0 text-right text-[0.66rem] font-semibold text-foreground tabular-nums">
              {s.n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Minimal line icons (no hand-drawn art inside product UI) ── */
export const Icon = {
  Search: (p: IP) => (
    <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>
  ),
  Plus: (p: IP) => <I {...p}><path d="M12 5v14M5 12h14" /></I>,
  Filter: (p: IP) => <I {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></I>,
  Close: (p: IP) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>,
  ChevronLeft: (p: IP) => <I {...p}><path d="M15 6l-6 6 6 6" /></I>,
  ChevronRight: (p: IP) => <I {...p}><path d="M9 6l6 6-6 6" /></I>,
  Refresh: (p: IP) => <I {...p}><path d="M20 11a8 8 0 1 0-.5 4M20 5v6h-6" /></I>,
  Arrow: (p: IP) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>,
  Lock: (p: IP) => (
    <I {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>
  ),
  Puzzle: (p: IP) => (
    <I {...p}><path d="M10 4h4v3a2 2 0 1 0 4 0V4h2v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V4h2" /></I>
  ),
  Clock: (p: IP) => <I {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></I>,
  Check: (p: IP) => <I {...p}><path d="M5 12.5l4.5 4.5L19 6.5" /></I>,
  Spark: (p: IP) => (
    <I {...p} fill="currentColor" stroke="none">
      <path d="M12 2c1 5 2 6 7 7-5 1-6 2-7 7-1-5-2-6-7-7 5-1 6-2 7-7Z" />
    </I>
  ),
  Home: (p: IP) => (
    <I {...p}><path d="M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" /><path d="M10 20v-6h4v6" /></I>
  ),
  Bookmark: (p: IP) => (
    <I {...p}><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z" /></I>
  ),
  Bell: (p: IP) => (
    <I {...p}><path d="M6 16c-1.5 0-2-1.5-1-2.5S6.5 11 6.5 9a5.5 5.5 0 0 1 11 0c0 2 .5 3.5 1.5 4.5s.5 2.5-1 2.5z" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></I>
  ),
  File: (p: IP) => (
    <I {...p}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M13 3v5h5" /></I>
  ),
  Gear: (p: IP) => (
    <I {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></I>
  ),
  Mail: (p: IP) => (
    <I {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></I>
  ),
};

type IP = { className?: string };
function I({ className, children, fill = "none", stroke = "currentColor" }: IP & { children: React.ReactNode; fill?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
