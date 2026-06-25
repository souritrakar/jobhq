import { Reveal } from "./reveal";
import { HandIcon } from "./hand-icon";
import { SectionIntro } from "./section-intro";
import { Peep } from "./peep";
import { Sparkle, Squiggle } from "./scribbles";

type Persona = {
  peep: "shrug" | "stand" | "sit";
  /** Mirror the peep for visual variety across the row. */
  flip?: boolean;
  icon: string;
  title: string;
  body: string;
  tags: string[];
  /** Fern-tinted card vs. paper card. */
  tint?: boolean;
};

const PERSONAS: Persona[] = [
  {
    peep: "stand",
    icon: "checklist",
    title: "New grads & students",
    body: "Firing off applications across job boards and career fairs at once — without losing track of who you've already hit up.",
    tags: ["Job boards", "Career fairs"],
    tint: false,
  },
  {
    peep: "shrug",
    icon: "clock",
    title: "Career switchers",
    body: "Squeezing applications in around a day job, in scattered late-night bursts. Get nudged before a deadline quietly slips past.",
    tags: ["Deadline nudges", "Off-hours"],
    tint: true,
  },
  {
    peep: "sit",
    icon: "puzzle",
    title: "Devs & high-volume applicants",
    body: "Applying everywhere — LinkedIn, Greenhouse, Lever, startup careers pages, the odd Discord drop. One pipeline pulls it all together.",
    tags: ["Greenhouse", "Lever", "Discord drops"],
    tint: false,
  },
];

const cardLift =
  "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-30px_rgba(20,30,20,0.35)]";

export function WhoItsFor() {
  return (
    <section id="who-its-for" className="relative scroll-mt-20 border-y border-border bg-secondary/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionIntro
          variant="center"
          title="Built for people applying everywhere at once."
        >
          If your search lives across a dozen tabs and a spreadsheet you keep
          forgetting to update, you&apos;re exactly who we made this for.
        </SectionIntro>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PERSONAS.map((p, i) => (
            <Reveal as="div" key={p.title} delay={i * 90}>
              <article
                className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border p-7 pb-0 ${cardLift} ${
                  p.tint
                    ? "border-primary/15 bg-fern-50/60"
                    : "border-border bg-card"
                }`}
              >
                {/* Hand-drawn accent, one per card, sparingly placed */}
                {i === 1 ? (
                  <Sparkle
                    aria-hidden
                    className="absolute right-6 top-6 w-5 text-sun"
                  />
                ) : (
                  <Squiggle
                    aria-hidden
                    className="absolute right-6 top-7 w-12 text-primary/35"
                  />
                )}

                <span className="grid size-11 place-items-center rounded-xl bg-fern-50 ring-1 ring-inset ring-primary/15">
                  <HandIcon name={p.icon} tint className="size-6 text-fern-700" />
                </span>

                <h3 className="mt-5 font-heading text-xl font-semibold tracking-tight text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">
                  {p.body}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-lg border border-border bg-background/80 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* The point of the section: the human, standing in the card */}
                <div className="mt-7 flex flex-1 items-end justify-center">
                  <Peep
                    name={p.peep}
                    float
                    style={{ animationDelay: `${i * 800}ms` }}
                    className={`h-36 w-auto ${p.flip ? "-scale-x-100" : ""}`}
                  />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
