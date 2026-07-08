import { Reveal } from "../reveal";

/* The problem beat: one editorial statement with marker underlines. Short on
   purpose; the feature blocks below carry the answer. */

function Underline({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        viewBox="0 0 120 10"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute -bottom-1 left-0 h-2.5 w-full text-primary/60"
      >
        <path
          d="M3 7C25 3 55 8 80 5s30-2 37 0"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

export function Problem() {
  return (
    <section id="how" className="scroll-mt-24 px-5 pb-24 pt-4 sm:pb-28">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-[1.9rem] font-bold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[2.5rem]">
          Right now your job search lives in{" "}
          <Underline>40 tabs</Underline>, three apps, and one{" "}
          <Underline>guilty spreadsheet</Underline>.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          None of them talk to each other, and the deadline you cared about is
          in whichever one you didn&apos;t open.
        </p>
      </Reveal>
    </section>
  );
}
