"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SectionIntro } from "./section-intro";
import { BrandLogo } from "./brand-logo";
import { DashboardMock, Icon } from "./dashboard-mock";

/* Interactive three-chapter tour. Each chapter renders a realistic UI panel so
   the page SHOWS the loop. Auto-advances, pauses on hover, reduced-motion aware. */

const STEPS = [
  {
    key: "capture",
    label: "Capture",
    title: "Save any job in one click",
    body: "A “Save” button appears on every posting — LinkedIn, Greenhouse, a careers page, even a Discord link. One click files it, no copy-paste.",
    panel: CapturePanel,
  },
  {
    key: "organize",
    label: "Organize",
    title: "Your whole search on one board",
    body: "Every saved role lands on a board that tracks itself — Saved, Applied, Interviewing, Offer. Status flows as you go.",
    panel: OrganizePanel,
  },
  {
    key: "remind",
    label: "Never miss out",
    title: "Deadlines that nudge you first",
    body: "jobhq reads the closing date off the posting and reminds you before it lapses — so a role never slips away.",
    panel: RemindPanel,
  },
] as const;

const DURATION = 5200;

export function ProductDemo() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.3,
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((i) => (i + 1) % STEPS.length), DURATION);
    return () => clearTimeout(t);
  }, [active, paused, inView]);

  const Panel = STEPS[active].panel;

  return (
    <section id="demo" className="scroll-mt-20 border-y border-border bg-secondary/30 px-5 py-20 sm:px-8 sm:py-28">
      <div
        ref={ref}
        className="mx-auto max-w-6xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <SectionIntro variant="center" title="See it work, end to end.">
          From the moment you spot a role to the day you hear back — here&apos;s the
          whole loop, in three steps.
        </SectionIntro>

        <div className="mt-12 grid items-stretch gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12">
          {/* Chapters */}
          <ol className="flex flex-col gap-3">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={on}
                    className={cn(
                      "group relative w-full cursor-pointer overflow-hidden rounded-2xl border px-5 py-4 text-left transition-all duration-300",
                      on
                        ? "border-primary/30 bg-card shadow-[0_18px_40px_-30px_rgba(20,40,25,0.5)]"
                        : "border-border/70 bg-card/40 hover:border-border hover:bg-card/70",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs font-bold transition-colors",
                          on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={cn(
                          "font-display text-base font-semibold tracking-[-0.01em] transition-colors",
                          on ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.title}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "grid text-sm leading-relaxed text-muted-foreground transition-all duration-300",
                        on ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <span className="overflow-hidden pl-11">{s.body}</span>
                    </p>
                    {on && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/15">
                        <span
                          key={active + (paused ? "-p" : "")}
                          className="block h-full w-full origin-left bg-primary"
                          style={{ animation: paused ? "none" : `demo-progress ${DURATION}ms linear forwards` }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Live panel */}
          <div className="relative flex min-h-[24rem] items-center justify-center rounded-[1.5rem] border border-border bg-card p-5 shadow-[0_24px_60px_-40px_rgba(20,40,25,0.4)] sm:p-7">
            <div key={active} className="animate-fade-up w-full">
              <Panel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Panels ───────────── */

function CapturePanel() {
  return (
    <div className="relative mx-auto max-w-lg">
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        {/* chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-secondary/70 px-3 py-2">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-1 flex h-6 flex-1 items-center gap-2 rounded-full border border-border bg-background px-3 text-[0.7rem] text-muted-foreground">
            <Icon.Lock className="size-3 text-muted-foreground/60" />
            linear.app/careers/senior-frontend-engineer
          </div>
        </div>
        {/* posting */}
        <div className="p-5">
          <div className="flex items-center gap-2.5">
            <BrandLogo slug="linear" label="Linear" className="size-10" />
            <div>
              <p className="font-display text-sm font-semibold text-foreground">Senior Frontend Engineer</p>
              <p className="text-xs text-muted-foreground">Linear</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["Full-time", "$160–210k", "React / TS"].map((t) => (
              <span key={t} className="rounded-md bg-secondary px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <span className="block h-2 w-full rounded-full bg-muted" />
            <span className="block h-2 w-[86%] rounded-full bg-muted" />
            <span className="block h-2 w-[62%] rounded-full bg-muted" />
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Icon.Puzzle className="size-4" /> Save to jobhq
          </button>
        </div>
      </div>

      {/* cursor + toast */}
      <CursorIcon className="absolute bottom-[4.5rem] left-[8.5rem] hidden size-5 text-foreground drop-shadow sm:block" />
      <div className="absolute -bottom-3 right-1 w-52 rounded-xl border border-border bg-card p-3 shadow-[0_18px_40px_-20px_rgba(20,40,25,0.45)]">
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-primary/15">
            <Icon.Check className="size-3 text-primary" />
          </span>
          <span className="text-xs font-semibold text-foreground">Saved to your board</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <BrandLogo slug="linear" label="Linear" className="size-5" />
          <span className="text-[0.7rem] text-muted-foreground">Filed under “Saved”</span>
        </div>
      </div>
    </div>
  );
}

function OrganizePanel() {
  return <DashboardMock className="shadow-[0_20px_50px_-36px_rgba(20,40,25,0.4)]" />;
}

const REMIND = [
  { slug: "linear", co: "Linear", role: "Senior Frontend Engineer", when: "Closes tomorrow", urgent: true },
  { slug: "notion", co: "Notion", role: "Web Platform Engineer", when: "Closes in 3 days" },
  { slug: "stripe", co: "Stripe", role: "Software Engineer", when: "Closes in 6 days" },
];

function RemindPanel() {
  return (
    <div className="relative mx-auto max-w-lg">
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold text-foreground">This week</p>
          <span className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <Icon.Clock className="size-3.5" /> 3 deadlines
          </span>
        </div>
        <div className="divide-y divide-border">
          {REMIND.map((r) => (
            <div key={r.role} className="flex items-center gap-3 px-4 py-3">
              <BrandLogo slug={r.slug} label={r.co} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.role}</p>
                <p className="text-xs text-muted-foreground">{r.co}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
                  r.urgent ? "bg-amber-100 text-amber-800" : "bg-secondary text-muted-foreground",
                )}
              >
                {r.when}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* push notification */}
      <div className="absolute -right-2 -top-4 w-60 rounded-xl border border-border bg-card p-3 shadow-[0_20px_44px_-18px_rgba(20,40,25,0.5)] animate-float-slow sm:-right-5">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <Icon.Clock className="size-3.5" />
          </span>
          <span className="text-xs font-bold text-foreground">jobhq</span>
          <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground">now</span>
        </div>
        <p className="mt-2 text-xs leading-snug text-foreground">
          <span className="font-semibold">Linear</span> closes tomorrow — you saved it 4
          days ago. Apply before it&apos;s gone.
        </p>
      </div>
    </div>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M5 3l14 8-6 1.5L9.5 19 5 3z" stroke="white" strokeWidth="1" />
    </svg>
  );
}
