import { Reveal } from "../reveal";
import { Peep } from "../peep";
import { SectionHead, Sticker } from "./bits";

/* Three people, three one-liners. The peeps do the talking. */

const PEOPLE = [
  {
    peep: "shrug" as const,
    sticker: "the 200-tab optimist",
    tint: "sky" as const,
    rotate: -3,
    line: "Saves everything, applies… eventually. Now the tabs can finally close.",
  },
  {
    peep: "stand" as const,
    sticker: "the career switcher",
    tint: "butter" as const,
    rotate: 2,
    line: "Five industries, five résumés, one board that keeps the thread.",
  },
  {
    peep: "sit" as const,
    sticker: "the final-year grad",
    tint: "blush" as const,
    rotate: -2,
    line: "A deadline every week. Now they knock before they pass.",
  },
];

export function Who() {
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHead
          eyebrow="who it's for"
          eyebrowTint="lilac"
          title={<>Built for however you hunt</>}
        />

        <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
          {PEOPLE.map((p, i) => (
            <Reveal key={p.sticker} delay={i * 130} className="flex flex-col items-center text-center">
              <div className="grid h-40 place-items-center">
                <Peep name={p.peep} className="max-h-40 w-auto" />
              </div>
              <Sticker tint={p.tint} rotate={p.rotate} className="mt-4">
                {p.sticker}
              </Sticker>
              <p className="mt-4 max-w-[26ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                {p.line}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
