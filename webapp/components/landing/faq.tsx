import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "Is JobTracker free?",
    a: "Yes — saving, tracking, and reminders are free to use. We may add optional paid AI features (like background applying) down the line, but the core tracker stays free.",
  },
  {
    q: "Does it only work on LinkedIn?",
    a: "Nope, that's the whole point. Save jobs from Indeed, Greenhouse, Lever, Wellfound, any company careers page — or paste a link to anything. If it's a job on the web, you can track it.",
  },
  {
    q: "How is this different from LinkedIn's Saved Jobs or a spreadsheet?",
    a: "Saved Jobs only works inside LinkedIn and never reminds you of anything. A spreadsheet needs constant manual updating. JobTracker captures jobs from everywhere, fills in the details for you, and actively reminds you before deadlines close.",
  },
  {
    q: "Do I need an account to start?",
    a: "You can install the extension and start saving right away. Create a free account when you want reminders, cloud sync across devices, and posting monitoring.",
  },
  {
    q: "Which browsers are supported?",
    a: "Chrome today, plus Chromium browsers like Edge, Brave, and Arc. More on the way.",
  },
  {
    q: "What happens to my data?",
    a: "Your saved jobs are yours. We don't sell your data, and you can export or delete your tracker anytime.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <div className="text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-[2.4rem] sm:leading-[1.1]">
              Questions, answered.
            </h2>
          </div>
        </Reveal>

        <Reveal className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
          {FAQS.map((item) => (
            <details key={item.q} className="group px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-heading text-base font-medium text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-transform duration-300 group-open:rotate-45 group-open:border-primary group-open:text-primary">
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
                    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="pb-5 pr-10 text-[0.95rem] leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
