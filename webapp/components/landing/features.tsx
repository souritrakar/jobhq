import { SectionIntro } from "./section-intro";
import { Reveal } from "./reveal";
import { BrandLogo } from "./brand-logo";
import { HandIcon } from "./hand-icon";
import { Icon } from "./dashboard-mock";
import { cn } from "@/lib/utils";

/**
 * Features — an asymmetric bento (Cal.com / Typefully register). Every cell is a
 * clean card carrying a real-looking product fragment on a calm neutral inset —
 * show, don't tell, so copy stays to a single line. One deep "glow" tile anchors
 * the grid as the single bold moment; the rest are quiet paper cards.
 * Reflows 1-col → 2-col → 6-col bento.
 */
export function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionIntro
          variant="left"
          eyebrow="What it does"
          title="Everything you opened. Everything you still need to do."
        >
          Saving a role is the easy part. jobhq keeps the rest — and hands it
          back as a next action.
        </SectionIntro>

        <div className="mt-14 grid auto-rows-[1fr] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <BentoCard
            icon="puzzle"
            title="One-click save"
            body="One button on any posting."
            className="sm:col-span-2 lg:col-span-4"
            mock={<OneClickMock />}
          />
          <BentoCard
            icon="sync"
            title="Auto-captured details"
            body="Read straight off the page."
            className="lg:col-span-2"
            mock={<CaptureMock />}
          />
          <BentoCard
            icon="cloud-download"
            title="Unfinished application recovery"
            body="Back before the posting closes."
            className="lg:col-span-3"
            mock={<RecoveryMock />}
          />
          <BentoCard
            icon="calendar"
            title="Deadline reminders"
            body="A nudge before a role goes stale."
            className="lg:col-span-3"
            mock={<DeadlineMock />}
          />
          <BentoCard
            icon="checklist"
            title="Next-action queue"
            body="Every job, one clear next step."
            className="lg:col-span-2"
            mock={<QueueMock />}
          />
          <BentoCard
            glow
            icon="idea"
            title="AI prep for saved jobs"
            body="A resume angle and the gaps to close — drafted the moment you save."
            className="sm:col-span-2 lg:col-span-4"
            mock={<AiPrepMock />}
          />
        </div>
      </div>
    </section>
  );
}

/* ── Bento cell ──────────────────────────────────────────────────────────── */
function BentoCard({
  icon,
  title,
  body,
  mock,
  className,
  glow,
}: {
  icon: string;
  title: string;
  body: string;
  mock: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <Reveal
      as="article"
      className={cn(
        "group flex min-h-[17rem] flex-col overflow-hidden rounded-[1.4rem]",
        glow ? "glow-cell text-white ring-1 ring-inset ring-pine/30" : "border border-border bg-card",
        className,
      )}
    >
      <div className="p-6 pb-4 sm:p-7 sm:pb-5">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl",
            glow ? "bg-white/12 ring-1 ring-inset ring-white/10" : "bg-fern-50",
          )}
        >
          <HandIcon name={icon} tint className={cn("size-[1.1rem]", glow ? "text-white" : "text-primary")} />
        </span>
        <h3
          className={cn(
            "mt-4 font-display text-[1.12rem] font-semibold leading-[1.2] tracking-[-0.015em] text-balance",
            glow ? "text-white" : "text-foreground",
          )}
        >
          {title}
        </h3>
        <p className={cn("mt-1.5 text-[0.875rem] leading-snug", glow ? "text-fern-100/80" : "text-muted-foreground")}>
          {body}
        </p>
      </div>

      {/* mock region — a real fragment, framed like a screenshot */}
      <div
        className={cn(
          "relative mt-auto flex flex-1 items-end justify-center px-6 pb-6 pt-1 sm:px-7 sm:pb-7",
          !glow && "mock-stage border-t border-border",
        )}
      >
        {mock}
      </div>
    </Reveal>
  );
}

/* ── Mini-mockups (compact, real, low-noise) ────────────────────────────────── */

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border bg-card p-3 shadow-[0_16px_36px_-26px_rgba(20,40,25,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function OneClickMock() {
  return (
    <Shell className="relative max-w-sm">
      <div className="flex items-center gap-2.5">
        <BrandLogo slug="linear" label="Linear" className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.82rem] font-semibold text-foreground">Senior Frontend Engineer</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">Linear · Remote · Full-time</p>
        </div>
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[0.8rem] font-semibold text-primary-foreground"
      >
        <Icon.Puzzle className="size-4" /> Save to jobhq
      </button>
      {/* cursor */}
      <svg viewBox="0 0 24 24" className="absolute -bottom-1.5 right-7 size-5 text-foreground drop-shadow-md" fill="currentColor" aria-hidden>
        <path d="M5 3l14 8-6 1.5L9.5 19 5 3z" stroke="white" strokeWidth="1" />
      </svg>
    </Shell>
  );
}

const FIELDS = [
  ["Role", "Frontend Engineer"],
  ["Company", "Mercury"],
  ["Salary", "$160–210k"],
  ["Deadline", "in 5 days"],
] as const;

function CaptureMock() {
  return (
    <Shell>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-primary" />
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Auto-filled
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {FIELDS.map(([k, v], i) => (
          <div
            key={k}
            className="rounded-lg border border-border bg-secondary/30 px-2 py-1.5"
            style={{ animation: `fade-up 0.6s cubic-bezier(0.22,1,0.36,1) ${i * 120}ms both` }}
          >
            <p className="text-[0.55rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{k}</p>
            <p className="mt-0.5 truncate text-[0.72rem] font-semibold text-foreground">{v}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function RecoveryMock() {
  return (
    <Shell className="max-w-sm">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-amber-100">
          <Icon.Clock className="size-3.5 text-amber-700" />
        </span>
        <p className="text-[0.78rem] font-semibold text-foreground">Reminder due today</p>
        <span className="ml-auto size-2 rounded-full bg-amber-500" />
      </div>
      <p className="mt-2 text-[0.72rem] leading-snug text-muted-foreground">
        You started <span className="font-medium text-foreground">Stripe · Software Engineer</span> 4 days ago.
      </p>
      <div className="mt-3 flex gap-1.5">
        <span className="rounded-lg bg-primary px-2.5 py-1 text-[0.66rem] font-semibold text-primary-foreground">
          Finish application
        </span>
        <span className="rounded-lg border border-border bg-background px-2.5 py-1 text-[0.66rem] font-medium text-muted-foreground">
          Remind tomorrow
        </span>
      </div>
    </Shell>
  );
}

const DLINES = [
  { slug: "linear", co: "Linear", when: "Tomorrow", urgent: true },
  { slug: "ramp", co: "Ramp", when: "In 6 days", urgent: false },
] as const;

function DeadlineMock() {
  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col gap-1.5">
        {DLINES.map((d) => (
          <div key={d.co} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
            <BrandLogo slug={d.slug} label={d.co} className="size-5" />
            <span className="flex-1 text-[0.74rem] font-semibold text-foreground">{d.co}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.62rem] font-semibold",
                d.urgent ? "bg-amber-100 text-amber-800" : "bg-secondary text-muted-foreground",
              )}
            >
              {d.when}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-pine p-2.5 text-white shadow-md">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white/15">
          <Icon.Clock className="size-3.5 text-white" />
        </span>
        <p className="text-[0.68rem] leading-snug text-fern-100">Linear closes tomorrow — apply now.</p>
      </div>
    </div>
  );
}

const QUEUE = [
  { task: "Tailor resume", done: true },
  { task: "Find referral", done: false },
  { task: "Review requirements", done: false },
] as const;

function QueueMock() {
  return (
    <Shell>
      <div className="flex flex-col gap-2">
        {QUEUE.map((q) => (
          <div key={q.task} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-[6px] border",
                q.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {q.done && <Icon.Check className="size-2.5" />}
            </span>
            <span
              className={cn(
                "text-[0.74rem] font-medium",
                q.done ? "text-muted-foreground line-through" : "text-foreground",
              )}
            >
              {q.task}
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function AiPrepMock() {
  return (
    <div className="w-full max-w-md rounded-xl border border-white/12 bg-white/[0.07] p-3.5 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
        <BrandLogo slug="linear" label="Linear" className="size-6" />
        <span className="truncate text-[0.74rem] font-semibold text-white">AI prep · Senior Frontend Engineer</span>
        <Icon.Spark className="ml-auto size-3.5 shrink-0 text-sun" />
      </div>
      <div className="mt-2.5 space-y-1.5">
        {[
          "Lead with design-system + perf work",
          "Link your strongest UI craft",
          "Gap: add a TypeScript-heavy project",
        ].map((t) => (
          <div key={t} className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-fern-100" />
            <span className="text-[0.72rem] leading-snug text-white/75">{t}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[0.72rem] font-semibold text-pine"
      >
        <Icon.Spark className="size-3.5" /> Tailor my resume
      </button>
    </div>
  );
}
