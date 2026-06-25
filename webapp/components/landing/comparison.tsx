import { SectionIntro } from "./section-intro";
import { Reveal } from "./reveal";
import { BrandLogo } from "./brand-logo";
import { Icon } from "./dashboard-mock";
import { TabsDoodle, BookmarkDoodle, BoltDoodle, CheckScribble } from "./scribbles";
import { cn } from "@/lib/utils";

/**
 * Comparison — a product-story section (Linear / Ramp register), NOT a table.
 * Three "leaves work behind" alternatives rendered as quiet cards with a messy
 * hand-drawn watermark, then one bold, clean, structured JobTracker card that
 * resolves the chaos. Reflows 1-col → 2-col → 3-up + full-width hero card.
 */

type Alt = {
  doodle: React.ReactNode;
  title: string;
  subtitle: string;
  points: string[];
};

const ALTS: Alt[] = [
  {
    doodle: <TabsDoodle className="w-[20px]" />,
    title: "Tabs & bookmarks",
    subtitle: "Fast to save. Easy to forget.",
    points: [
      "No deadline tracking",
      "No application status",
      "No next action",
      "Lost across windows and devices",
    ],
  },
  {
    doodle: <BookmarkDoodle className="w-[17px]" />,
    title: "Saved jobs",
    subtitle: "Useful, but trapped inside one platform.",
    points: [
      "Only works on that job board",
      "Weak reminders",
      "No external links",
      "No workflow after saving",
    ],
  },
  {
    doodle: <BoltDoodle className="w-[17px]" />,
    title: "AI apply tools",
    subtitle: "Helpful once you’re applying. Less so before.",
    points: [
      "Focused on resumes, autofill, auto-apply",
      "Tracking still needs setup or cleanup",
      "Misses jobs found outside the workflow",
      "Not built for “come back to this later”",
    ],
  },
];

const WINS = [
  "Save jobs from almost anywhere",
  "Auto-capture role, company, source, link, and deadline",
  "Track review, resume, apply, waiting, and follow-up",
  "Get reminded before roles go stale",
  "Manage everything from one dashboard",
];

export function Comparison() {
  return (
    <section id="compare" className="scroll-mt-20 border-y border-border bg-secondary/30 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionIntro
          variant="center"
          eyebrow="Why JobTracker"
          title="Saved jobs, tabs, and apply tools still leave work behind."
        >
          Most tools help with one part of the search. JobTracker starts earlier:
          the moment you find a role, it captures the posting, tracks what still
          needs doing, and brings it back before you forget.
        </SectionIntro>

        {/* the three alternatives */}
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALTS.map((a, i) => (
            <Reveal as="article" key={a.title} delay={i * 80}>
              <div className="relative h-full rounded-2xl border border-border bg-card p-6">
                {/* hand-drawn glyph — a neat, consistent corner chip */}
                <span className="pointer-events-none absolute right-5 top-5 grid size-9 place-items-center rounded-xl border border-border bg-secondary/40 text-muted-foreground/55">
                  {a.doodle}
                </span>
                <h3 className="pr-11 font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
                  {a.title}
                </h3>
                <p className="mt-1 pr-11 text-sm font-medium text-muted-foreground">{a.subtitle}</p>
                <ul className="mt-5 space-y-2.5">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[0.85rem] text-muted-foreground">
                      <span className="mt-1.5 grid size-3.5 shrink-0 place-items-center rounded-full border border-border">
                        <span className="h-px w-1.5 bg-muted-foreground/60" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* the resolution — JobTracker, clean & structured */}
        <Reveal as="article" className="mt-4" delay={120}>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-primary/25 bg-card shadow-[0_30px_70px_-44px_rgba(20,40,25,0.5)]">
            <div className="pointer-events-none absolute inset-0 brand-surface opacity-[0.06]" />
            <div className="relative grid gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-12">
              {/* copy */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                    J
                  </span>
                  <span className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
                    JobTracker
                  </span>
                </div>
                <p className="mt-3 font-display text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground text-balance">
                  Every job becomes a next action.
                </p>
                <ul className="mt-5 space-y-3">
                  {WINS.map((w) => (
                    <li key={w} className="flex items-start gap-3 text-[0.92rem] font-medium text-foreground">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-fern-50">
                        <CheckScribble className="w-3 text-primary" />
                      </span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>

              {/* clean structured mini-board (the antidote to the doodles) */}
              <CleanBoard />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const BOARD = [
  { slug: "linear", co: "Linear", role: "Senior Frontend Engineer", source: "LinkedIn", chip: "Resume", tone: "amber" },
  { slug: "mercury", co: "Mercury", role: "Backend Engineer", source: "Company site", chip: "Referral", tone: "fern" },
  { slug: "runway", co: "Runway", role: "AI Product Engineer", source: "Wellfound", chip: "Review", tone: "sky" },
] as const;

function CleanBoard() {
  return (
    <div className="rounded-2xl border border-border bg-background p-3.5 shadow-[0_24px_50px_-36px_rgba(20,40,25,0.45)]">
      <div className="flex items-center justify-between px-0.5 pb-2.5">
        <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
          <Icon.Spark className="size-3.5 text-sun" /> One dashboard
        </span>
        <span className="text-[0.66rem] font-medium text-muted-foreground">23 jobs</span>
      </div>
      <div className="flex flex-col gap-2">
        {BOARD.map((b) => (
          <div key={b.role} className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5">
            <BrandLogo slug={b.slug} label={b.co} className="size-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.78rem] font-semibold text-foreground">{b.role}</p>
              <p className="text-[0.66rem] text-muted-foreground">
                {b.co} · Saved from {b.source}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold",
                b.tone === "amber" && "bg-amber-100 text-amber-800",
                b.tone === "fern" && "bg-fern-50 text-primary",
                b.tone === "sky" && "bg-sky-100 text-sky-700",
              )}
            >
              {b.chip}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
