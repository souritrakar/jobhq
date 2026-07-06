import { BrandLogo } from "../brand-logo";
import { Icon } from "../dashboard-mock";
import { SectionHead } from "./bits";
import { Tile } from "./tile";
import { cn } from "@/lib/utils";

/* Bento #2 — the web app. The calm half: pipeline, reminders, cover letters,
   notes & to-dos. Same tile grammar as the extension bento. */

export function BentoApp() {
  return (
    <section id="app" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead
          eyebrow="the web app"
          eyebrowTint="butter"
          title={<>…then it all lives in one calm place</>}
          intro="Every saved job lands on a board that keeps itself honest — with the deadlines, drafts, and to-dos attached."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {/* pipeline board — wide anchor */}
          <Tile
            tag="pipeline"
            title="Your whole search on one board"
            blurb="Drag a card from Saved to Offer. The stats keep score for you."
            className="lg:col-span-4"
          >
            <PipelineVignette />
          </Tile>

          {/* reminders */}
          <Tile
            tag="reminders"
            tint="sky"
            title="Deadlines that find you"
            blurb="Interview nudges 24h ahead, a Monday digest, overdue flags — by email or in-app."
            className="lg:col-span-2"
            delay={100}
          >
            <div className="space-y-2">
              <ReminderRow
                icon={<Icon.Clock className="size-3.5 text-status-rejected-foreground" />}
                iconBg="bg-status-rejected"
                title="Follow up with Mercury"
                chip="Overdue"
                chipClass="bg-status-rejected text-status-rejected-foreground"
              />
              <ReminderRow
                icon={<Icon.Bell className="size-3.5 text-status-interviewing-foreground" />}
                iconBg="bg-status-interviewing"
                title="Interview with Linear · 2pm"
                chip="Today"
                chipClass="bg-status-interviewing text-status-interviewing-foreground"
              />
              <ReminderRow
                icon={<Icon.Mail className="size-3.5 text-primary" />}
                iconBg="bg-fern-50"
                title="Notion application closes"
                chip="Fri"
                chipClass="bg-white/80 text-muted-foreground"
              />
            </div>
          </Tile>

          {/* cover letters */}
          <Tile
            tag="cover letters"
            tint="lilac"
            title="A draft from your real résumé"
            blurb="Pick the job, pick the résumé — get a letter that sounds like you, exported to .docx or PDF."
            className="lg:col-span-3"
            delay={150}
          >
            <CoverLetterVignette />
          </Tile>

          {/* notes & todos */}
          <Tile
            tag="notes & to-dos"
            title="A tiny checklist per job"
            blurb="Referrals to chase, questions to ask, thank-yous to send — attached to the job they belong to."
            className="lg:col-span-3"
            delay={220}
          >
            <div className="space-y-1.5">
              <TodoRow done label="Tailor résumé for Linear" />
              <TodoRow done label="Ask Priya for a referral" />
              <TodoRow label="Send thank-you note" chip="Tomorrow" />
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-[0.72rem] text-muted-foreground">
                <Icon.Plus className="size-3.5" /> Add a task…
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

/* ── vignettes ── */

const COLUMNS: {
  name: string;
  count: number;
  pill: string;
  cards: { slug: string; co: string; role: string }[];
}[] = [
  {
    name: "Saved",
    count: 7,
    pill: "bg-status-saved text-status-saved-foreground",
    cards: [
      { slug: "runway", co: "Runway", role: "AI Product Engineer" },
      { slug: "ramp", co: "Ramp", role: "Frontend Engineer" },
    ],
  },
  {
    name: "Applied",
    count: 4,
    pill: "bg-status-applied text-status-applied-foreground",
    cards: [
      { slug: "mercury", co: "Mercury", role: "Backend Engineer" },
      { slug: "figma", co: "Figma", role: "Product Engineer" },
    ],
  },
  {
    name: "Interviewing",
    count: 2,
    pill: "bg-status-interviewing text-status-interviewing-foreground",
    cards: [{ slug: "linear", co: "Linear", role: "Sr. Frontend Engineer" }],
  },
  {
    name: "Offer",
    count: 1,
    pill: "bg-status-offer text-status-offer-foreground",
    cards: [{ slug: "notion", co: "Notion", role: "Product Engineer" }],
  },
];

function PipelineVignette() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {COLUMNS.map((col, ci) => (
        <div key={col.name} className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.64rem] font-semibold",
              col.pill,
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {col.name}
            <span className="opacity-60">{col.count}</span>
          </span>
          <div className="mt-2 space-y-2">
            {col.cards.map((card, i) => (
              <div
                key={card.role}
                className={cn(
                  "rounded-xl border border-border bg-background p-2.5 shadow-sm",
                  ci === 3 && "rotate-[1.5deg] border-primary/30 shadow-[0_14px_30px_-18px_rgba(20,40,25,0.45)]",
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-1.5">
                  <BrandLogo slug={card.slug} label={card.co} className="size-4" />
                  <span className="truncate text-[0.62rem] font-semibold text-foreground">
                    {card.co}
                  </span>
                </div>
                <p className="mt-1 truncate text-[0.66rem] font-medium text-muted-foreground">
                  {card.role}
                </p>
              </div>
            ))}
            {col.name === "Interviewing" && (
              <div className="rounded-xl border border-dashed border-border/80 p-2.5 text-center text-[0.6rem] text-muted-foreground/60">
                drop here
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReminderRow({
  icon,
  iconBg,
  title,
  chip,
  chipClass,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  chip: string;
  chipClass: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/80 px-3 py-2.5 shadow-[0_10px_24px_-18px_rgba(20,40,25,0.4)]">
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", iconBg)}>
        {icon}
      </span>
      <p className="min-w-0 flex-1 truncate text-[0.74rem] font-semibold text-foreground">{title}</p>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold", chipClass)}>
        {chip}
      </span>
    </div>
  );
}

function CoverLetterVignette() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/85 p-3.5 shadow-[0_16px_36px_-24px_rgba(20,40,25,0.4)]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-foreground">
          <Icon.File className="size-3.5 text-primary" /> resume_2026.pdf
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[0.66rem] font-semibold text-primary-foreground">
          <Icon.Spark className="size-3" /> Generate
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-[0.7rem] font-medium leading-relaxed text-foreground">
          Dear Linear team,
        </p>
        <span className="block h-1.5 w-full rounded-full bg-secondary" />
        <span className="block h-1.5 w-11/12 rounded-full bg-secondary" />
        <span className="block h-1.5 w-4/5 rounded-full bg-secondary" />
        <span
          className="block h-1.5 w-2/5 rounded-full bg-primary/30"
          style={{ animation: "type-reveal 2.8s steps(20, end) infinite" }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2.5 text-[0.62rem] font-semibold text-muted-foreground">
        <span className="rounded-md bg-secondary px-1.5 py-0.5">Copy</span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5">.docx</span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5">PDF</span>
        <span className="ml-auto font-medium">312 words</span>
      </div>
    </div>
  );
}

function TodoRow({ label, done, chip }: { label: string; done?: boolean; chip?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2">
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border",
          done ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {done && <Icon.Check className="size-2.5" />}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[0.74rem] font-medium",
          done ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {label}
      </span>
      {chip && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[0.62rem] font-medium text-muted-foreground">
          <Icon.Bell className="size-3" /> {chip}
        </span>
      )}
    </div>
  );
}
