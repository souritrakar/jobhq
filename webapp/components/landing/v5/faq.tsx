import { SectionHead } from "./bits";

/* Compact FAQ — native <details> so it's keyboard-accessible for free. */

const QA: { q: string; a: string }[] = [
  {
    q: "Is it free?",
    a: "Yes — the extension and the web app are free while we're in beta. No card, no trial countdown.",
  },
  {
    q: "Which job sites does it work on?",
    a: "All of them, effectively. LinkedIn, Indeed, Wellfound, Greenhouse, Lever, Ashby, Workday — plus any careers page or link a friend sends you. Detection runs on the page itself, so there's no allowlist to fall off of.",
  },
  {
    q: "Does it apply to jobs for me?",
    a: "No, and that's deliberate. Auto-apply bots send bad applications fast. jobhq does the filing — capturing, remembering, reminding, refilling your own answers — so the application you send is yours, just faster.",
  },
  {
    q: "Do I need the web app if I have the extension?",
    a: "The extension works on its own for saving. The web app is where the board, reminders, notes, documents, and cover letters live — they're better together.",
  },
  {
    q: "What happens to my data?",
    a: "It's yours. We store what you save — jobs, answers, notes — to show it back to you, and nothing is sold or shared. Delete a job (or your account) and it's gone.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-2xl">
        <SectionHead eyebrow="questions" title="Fair questions" />

        <div className="mt-14 divide-y divide-border/70 rounded-3xl border border-border bg-card px-6 sm:px-8">
          {QA.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left font-display text-[1.05rem] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-all duration-200 group-open:rotate-45 group-hover:border-foreground/30 group-hover:text-foreground">
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 pr-10 text-[0.95rem] leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
