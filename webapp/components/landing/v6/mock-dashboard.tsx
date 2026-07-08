import {
  Bell,
  CalendarDays,
  Clock3,
  FileText,
  Home,
  KanbanSquare,
  Plus,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoChip, Window } from "./bits";

/* The hero product window: a real mini-version of the dashboard (sidebar,
   greeting, pipeline board) with believable data. Register borrowed from
   Notion's hero board: white surface, near-black text, muted 4px status
   chips, meta as plain gray text. One accent (fern) inside the window. */

type Job = {
  slug: string;
  title: string;
  company: string;
  source: string;
  meta?: { icon: "calendar" | "clock"; label: string };
};

const COLUMNS: { name: string; tone: "saved" | "applied" | "interviewing" | "offer"; count: number; jobs: Job[] }[] = [
  {
    name: "Saved",
    tone: "saved",
    count: 7,
    jobs: [
      { slug: "figma", title: "Product Engineer", company: "Figma", source: "Careers page" },
      { slug: "vercel", title: "Design Engineer, Design Systems", company: "Vercel", source: "LinkedIn", meta: { icon: "clock", label: "Closes Friday" } },
      { slug: "stripe", title: "Frontend Engineer", company: "Stripe", source: "Greenhouse" },
    ],
  },
  {
    name: "Applied",
    tone: "applied",
    count: 4,
    jobs: [
      { slug: "ramp", title: "Growth PM", company: "Ramp", source: "Ashby" },
      { slug: "wellfound", title: "Backend Engineer", company: "Mercury", source: "Wellfound" },
    ],
  },
  {
    name: "Interviewing",
    tone: "interviewing",
    count: 2,
    jobs: [
      {
        slug: "linear",
        title: "Sr. Frontend Engineer",
        company: "Linear",
        source: "LinkedIn",
        meta: { icon: "calendar", label: "Interview Tue, 2pm" },
      },
    ],
  },
  {
    name: "Offer",
    tone: "offer",
    count: 1,
    jobs: [
      {
        slug: "notion",
        title: "Product Engineer",
        company: "Notion",
        source: "Referral",
      },
    ],
  },
];

const NAV = [
  { icon: Home, label: "Home", active: true },
  { icon: KanbanSquare, label: "Jobs" },
  { icon: Bell, label: "Reminders", count: 2 },
  { icon: FileText, label: "Documents" },
  { icon: Settings, label: "Settings" },
];

/** Notion-register status chip: small radius, muted pastel fill, tiny dot. */
function ColumnChip({
  label,
  tone,
}: {
  label: string;
  tone: "saved" | "applied" | "interviewing" | "offer";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-[5px] px-1.5 py-[2px] text-[0.64rem] font-medium",
        tone === "saved" && "bg-status-saved text-status-saved-foreground",
        tone === "applied" && "bg-status-applied text-status-applied-foreground",
        tone === "interviewing" && "bg-status-interviewing text-status-interviewing-foreground",
        tone === "offer" && "bg-status-offer text-status-offer-foreground",
      )}
    >
      <i className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

export function MockDashboard({ className }: { className?: string }) {
  return (
    <Window url="app.jobhq.com" className={className}>
      <div className="flex bg-[oklch(0.988_0.001_150)]">
        {/* Sidebar */}
        <aside className="hidden w-[172px] shrink-0 flex-col border-r border-black/[0.05] bg-white/70 px-3 pb-3 pt-4 sm:flex">
          <span className="flex items-center gap-1.5 px-1">
            <span className="grid size-5 place-items-center rounded-md bg-primary text-[0.6rem] font-bold text-primary-foreground">
              J
            </span>
            <span className="text-[0.78rem] font-bold text-foreground">
              Job<span className="text-primary">Tracker</span>
            </span>
          </span>
          <span className="mt-3.5 flex h-7 items-center justify-center gap-1 rounded-md bg-primary text-[0.68rem] font-semibold text-primary-foreground">
            <Plus className="size-3" strokeWidth={2.5} aria-hidden />
            Save a job
          </span>
          <nav className="mt-3 flex flex-col gap-0.5" aria-hidden>
            {NAV.map(({ icon: Icon, label, active, count }) => (
              <span
                key={label}
                className={cn(
                  "flex h-7 items-center gap-2 rounded-md px-2 text-[0.7rem]",
                  active
                    ? "bg-black/[0.05] font-medium text-foreground"
                    : "text-foreground/60",
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
                {label}
                {count && (
                  <span className="ml-auto text-[0.62rem] text-foreground/40">
                    {count}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <span className="mt-auto flex items-center gap-2 rounded-md px-2 pt-3">
            <span className="grid size-6 place-items-center rounded-full bg-black/[0.06] text-[0.58rem] font-semibold text-foreground/60">
              SO
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.66rem] font-medium text-foreground">Sam Okafor</span>
              <span className="text-[0.58rem] text-foreground/50">Free plan</span>
            </span>
          </span>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1 px-4 pb-4 pt-3.5 sm:px-5">
          <p className="text-[0.66rem] text-foreground/45">Monday, July 6</p>
          <h3 className="mt-0.5 text-[1.02rem] font-semibold tracking-tight text-foreground">
            Good morning, Sam
          </h3>

          {/* Board */}
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.name} className="min-w-0">
                <div className="flex items-center gap-1.5 px-0.5 pb-1.5">
                  <ColumnChip label={col.name} tone={col.tone} />
                  <span className="text-[0.62rem] text-foreground/40">
                    {col.count}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {col.jobs.map((job) => (
                    <div
                      key={job.title + job.company}
                      className="rounded-lg border border-black/[0.07] bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,30,20,0.03)]"
                    >
                      <div className="flex items-start gap-2">
                        <LogoChip slug={job.slug} className="mt-px size-4" />
                        <span className="min-w-0 text-[0.72rem] font-medium leading-snug text-foreground">
                          {job.title}
                        </span>
                      </div>
                      <p className="mt-1 truncate pl-6 text-[0.62rem] text-foreground/50">
                        {job.company} · {job.source}
                      </p>
                      {job.meta && (
                        <p className="mt-1 flex items-center gap-1 pl-6 text-[0.62rem] text-foreground/55">
                          {job.meta.icon === "calendar" ? (
                            <CalendarDays className="size-2.5" strokeWidth={1.8} aria-hidden />
                          ) : (
                            <Clock3 className="size-2.5" strokeWidth={1.8} aria-hidden />
                          )}
                          {job.meta.label}
                        </p>
                      )}
                    </div>
                  ))}
                  <span className="flex items-center gap-1 px-1 py-1 text-[0.62rem] text-foreground/35">
                    <Plus className="size-2.5" strokeWidth={2} aria-hidden />
                    Add job
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}
