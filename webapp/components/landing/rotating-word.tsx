"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type RotatingWordProps = {
  words: string[];
  className?: string;
  interval?: number;
};

/**
 * Cycles through a list of words with a soft fade/slide, with a blinking
 * caret — used to show "save from LinkedIn / Indeed / Discord …" so the hero
 * demonstrates the breadth of capture without a wall of logos. Pauses for
 * reduced-motion users (it simply settles on the first word).
 */
export function RotatingWord({ words, className, interval = 1900 }: RotatingWordProps) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setI((v) => (v + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      {/* ink shade, not --primary: this is body-size copy and must clear AA */}
      <span key={i} className="animate-fade-up font-semibold text-[var(--tint-fern-ink)]">
        {words[i]}
      </span>
      <span
        aria-hidden
        className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] bg-primary"
        style={{ animation: "blink-caret 1.1s steps(1) infinite" }}
      />
    </span>
  );
}
