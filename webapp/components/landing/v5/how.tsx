import { Reveal } from "../reveal";
import { ArrowDoodle } from "../scribbles";
import { BrandLogo } from "../brand-logo";
import { Icon } from "../dashboard-mock";
import { SectionHead, TINT } from "./bits";

/* Three beats, three tiny theatre sets. A real sequence, so it earns its
   numbers — Pally digits in tint circles, scribble arrows carrying the eye. */

export function How() {
  return (
    <section id="how" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead
          eyebrow="how it works"
          eyebrowTint="sky"
          title={<>Save in one click. Forget nothing.</>}
          intro="No forms, no copy-paste, no tab hoarding. The extension does the filing; the app does the remembering."
        />

        <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-start lg:gap-4">
          <Step
            n={1}
            tint="fern"
            delay={0}
            title="See it, save it"
            blurb="A quiet Save button appears on every job page. One click, done."
          >
            <JobPageVignette />
          </Step>

          <StepArrow className="lg:mt-24" />

          <Step
            n={2}
            tint="butter"
            delay={140}
            title="Everything's captured"
            blurb="Deadline, salary, location, application questions — filed before you close the tab."
          >
            <CapturedVignette />
          </Step>

          <StepArrow flip className="lg:mt-40" />

          <Step
            n={3}
            tint="blush"
            delay={280}
            title="Nagged, nicely"
            blurb="A reminder lands before anything closes. Zero deadlines lost to tab #47."
          >
            <ReminderVignette />
          </Step>
        </div>
      </div>
    </section>
  );
}

function Step({
  n,
  tint,
  title,
  blurb,
  delay,
  children,
}: {
  n: number;
  tint: keyof typeof TINT;
  title: string;
  blurb: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className="flex flex-col items-center text-center">
      <div className="w-full max-w-xs">{children}</div>
      <span
        className="mt-6 grid size-9 place-items-center rounded-full font-[family-name:var(--font-pally)] text-[1.05rem] font-bold"
        style={{ backgroundColor: TINT[tint].bg, color: TINT[tint].ink }}
      >
        {n}
      </span>
      <h3 className="mt-3 font-display text-[1.25rem] font-bold tracking-[-0.015em] text-foreground">
        {title}
      </h3>
      <p className="mt-2 max-w-[26ch] text-[0.95rem] leading-relaxed text-muted-foreground">
        {blurb}
      </p>
    </Reveal>
  );
}

function StepArrow({ flip, className }: { flip?: boolean; className?: string }) {
  return (
    <div className={`hidden justify-center lg:flex ${className ?? ""}`}>
      <ArrowDoodle
        className={`w-16 text-primary/40 ${flip ? "-scale-y-100 rotate-[240deg]" : "rotate-[-60deg]"}`}
      />
    </div>
  );
}

/* ── vignettes ── */

/** A LinkedIn-ish job page with the injected Save button mid-pulse. */
function JobPageVignette() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_50px_-30px_rgba(20,40,25,0.45)]">
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary/60 px-3 py-2">
        <BrandLogo slug="linkedin" label="LinkedIn" className="size-4" />
        <span className="h-2 w-24 rounded-full bg-border" />
      </div>
      <div className="p-4 text-left">
        <p className="text-[0.9rem] font-bold text-foreground">Senior Frontend Engineer</p>
        <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Linear · Remote · 2d ago</p>
        <div className="mt-3 space-y-1.5">
          <span className="block h-1.5 w-full rounded-full bg-secondary" />
          <span className="block h-1.5 w-4/5 rounded-full bg-secondary" />
          <span className="block h-1.5 w-3/5 rounded-full bg-secondary" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full bg-foreground/85 px-3.5 py-1.5 text-[0.7rem] font-semibold text-background">
            Apply
          </span>
          <span className="animate-pulse-once inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[0.7rem] font-semibold text-primary-foreground">
            <Icon.Bookmark className="size-3" /> Save
          </span>
        </div>
      </div>
    </div>
  );
}

/** The captured card — every fact checked off. */
function CapturedVignette() {
  const facts = [
    { label: "Deadline", value: "Friday, Jul 10" },
    { label: "Salary", value: "$170k–210k" },
    { label: "Questions", value: "6 captured" },
    { label: "Source", value: "LinkedIn" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left shadow-[0_24px_50px_-30px_rgba(20,40,25,0.45)]">
      <div className="flex items-center gap-2.5">
        <BrandLogo slug="linear" label="Linear" className="size-7" />
        <div>
          <p className="text-[0.8rem] font-bold leading-tight text-foreground">
            Senior Frontend Engineer
          </p>
          <p className="text-[0.66rem] text-muted-foreground">Linear</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {facts.map((f) => (
          <div key={f.label} className="flex items-center gap-2 text-[0.72rem]">
            <Icon.Check className="size-3.5 shrink-0 text-primary" />
            <span className="w-16 text-muted-foreground">{f.label}</span>
            <span className="font-medium text-foreground">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The nudge — an inbox notification you're glad you got. */
function ReminderVignette() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-border bg-card p-3.5 text-left shadow-[0_24px_50px_-30px_rgba(20,40,25,0.45)]">
        <div className="flex items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-status-interviewing">
            <Icon.Bell className="size-3.5 text-status-interviewing-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.76rem] font-bold text-foreground">
              Linear closes tomorrow
            </p>
            <p className="text-[0.64rem] text-muted-foreground">
              You&apos;re 80% done — finish the last two answers.
            </p>
          </div>
        </div>
      </div>
      <div className="ml-6 rounded-2xl border border-border bg-card p-3.5 text-left opacity-80 shadow-[0_18px_40px_-28px_rgba(20,40,25,0.4)]">
        <div className="flex items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fern-50">
            <Icon.Mail className="size-3.5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.76rem] font-bold text-foreground">Your Monday digest</p>
            <p className="text-[0.64rem] text-muted-foreground">
              3 deadlines this week · 1 interview Thursday
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
