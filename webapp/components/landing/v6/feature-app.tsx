import { Bell, CalendarClock, Check, FileText, Mail } from "lucide-react";
import { Reveal } from "../reveal";
import { LogoChip, SectionLabel, Window } from "./bits";

/* The web app: a calm neutral stage holding a job-detail window, with the
   reminder surfaces (toast + digest) floating beside it. Same register as the
   hero window: white surface, gray meta, muted status chip, fern accent only. */

function MockJobDetail() {
  return (
    <Window url="app.jobhq.com/jobs/linear" className="w-full">
      <div className="bg-white px-5 pb-5 pt-4 sm:px-6">
        {/* Job header */}
        <div className="flex flex-wrap items-center gap-3">
          <LogoChip slug="linear" className="size-9" />
          <div className="min-w-0">
            <h4 className="text-[0.95rem] font-semibold tracking-tight text-foreground">
              Senior Frontend Engineer
            </h4>
            <p className="text-[0.7rem] text-foreground/50">
              Linear · Saved from LinkedIn · $170k to $210k
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-[5px] bg-status-interviewing px-1.5 py-[2px] text-[0.64rem] font-medium text-status-interviewing-foreground">
            <i className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
            Interviewing
          </span>
        </div>

        {/* Panels */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-black/[0.06] p-3">
            <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-foreground/70">
              <CalendarClock className="size-3.5 text-foreground/50" strokeWidth={1.8} aria-hidden />
              Interview
            </p>
            <p className="mt-2 text-[0.78rem] font-medium text-foreground">Tuesday, 2:00 pm</p>
            <p className="mt-0.5 text-[0.64rem] text-foreground/50">
              Reminder set for 24h before
            </p>
          </div>

          <div className="rounded-lg border border-black/[0.06] p-3">
            <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-foreground/70">
              <Check className="size-3.5 text-primary" strokeWidth={2.4} aria-hidden />
              To-dos
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {[
                { t: "Tailor resume", done: true },
                { t: "Ask Priya for a referral", done: true },
                { t: "Send thank-you note", done: false },
              ].map((item) => (
                <li key={item.t} className="flex items-center gap-1.5 text-[0.68rem]">
                  <span
                    className={
                      item.done
                        ? "grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground"
                        : "size-3.5 rounded-full border border-black/[0.15]"
                    }
                  >
                    {item.done && <Check className="size-2.5" strokeWidth={3.4} aria-hidden />}
                  </span>
                  <span
                    className={
                      item.done
                        ? "text-foreground/40 line-through"
                        : "text-foreground"
                    }
                  >
                    {item.t}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-black/[0.06] p-3">
            <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-foreground/70">
              <FileText className="size-3.5 text-foreground/50" strokeWidth={1.8} aria-hidden />
              Cover letter
            </p>
            <p className="mt-2 line-clamp-2 text-[0.68rem] leading-relaxed text-foreground/60">
              &ldquo;Dear Linear team, I&apos;ve spent four years building
              interfaces where speed is the feature...&rdquo;
            </p>
            <div className="mt-2 flex gap-1">
              {["Copy", ".docx", "PDF"].map((b) => (
                <span
                  key={b}
                  className="rounded-md border border-black/[0.08] px-2 py-0.5 text-[0.6rem] font-medium text-foreground/60"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

function ReminderCards() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-black/[0.07] bg-white p-3.5 shadow-[0_12px_30px_-18px_rgba(15,30,20,0.32)]">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/[0.05] text-foreground/70">
          <Bell className="size-4" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[0.76rem] font-semibold text-foreground">Linear closes tomorrow</p>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-foreground/55">
            You&apos;re 80% done. Two answers left to finish.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-2.5 rounded-xl border border-black/[0.07] bg-white p-3.5 shadow-[0_12px_30px_-18px_rgba(15,30,20,0.32)]">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[color:var(--tint-fern)] text-[color:var(--tint-fern-ink)]">
          <Mail className="size-4" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[0.76rem] font-semibold text-foreground">Your Monday digest</p>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-foreground/55">
            3 deadlines this week. One interview on Thursday.
          </p>
        </div>
      </div>
      <p className="px-1 text-[0.72rem] leading-snug text-foreground/50">
        Reminders arrive by email, in the app, and in the extension.
      </p>
    </div>
  );
}

export function FeatureApp() {
  return (
    <section id="app" className="scroll-mt-24 px-5 pb-24 sm:pb-28">
      <Reveal className="mx-auto max-w-6xl">
        <div className="rounded-2xl bg-secondary px-6 pb-10 pt-10 sm:px-12 sm:pb-12 sm:pt-14">
          <div className="max-w-2xl">
            <SectionLabel ink="var(--stage-sage-ink)">The web app</SectionLabel>
            <h2 className="mt-2.5 font-display text-[1.8rem] font-bold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[2.3rem]">
              Every saved job gets its own page
            </h2>
            <p className="mt-4 max-w-lg text-[0.98rem] leading-relaxed text-foreground/70">
              Interview dates, to-dos, notes, and cover letter drafts stay
              with the job. Reminders go out before deadlines and interviews.
            </p>
          </div>

          <div className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,8.5fr)_minmax(0,3.5fr)]">
            <MockJobDetail />
            <ReminderCards />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
