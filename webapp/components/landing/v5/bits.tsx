import { cn } from "@/lib/utils";

/* Small shared v5 pieces — the playful voice lives here so sections stay clean.

   Palette discipline: the whole page is drawn with ONE green marker (fern —
   stickers, scribbles, annotations, the wordmark) and ONE highlighter
   (butter — highlight swipes, deadline warmth). Everything else is neutral
   paper. Don't add a third color. */

type TintName = "fern" | "butter" | "neutral";

export const TINT: Record<TintName, { bg: string; ink: string }> = {
  fern: { bg: "var(--tint-fern)", ink: "var(--tint-fern-ink)" },
  butter: { bg: "var(--tint-butter)", ink: "var(--tint-butter-ink)" },
  neutral: { bg: "var(--secondary)", ink: "var(--muted-foreground)" },
};

/** Pally sticker chip — tilted a touch so it reads placed-by-hand. */
export function Sticker({
  children,
  tint = "fern",
  rotate = -2,
  className,
}: {
  children: React.ReactNode;
  tint?: TintName;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "sticker hover-wobble inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm",
        className,
      )}
      style={{
        backgroundColor: TINT[tint].bg,
        color: TINT[tint].ink,
        transform: `rotate(${rotate}deg)`,
        ["--pop-rotate" as string]: `${rotate}deg`,
      }}
    >
      {children}
    </span>
  );
}

/** Section header — sticker eyebrow + big Satoshi headline + optional intro. */
export function SectionHead({
  eyebrow,
  title,
  intro,
  align = "center",
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  intro?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      {eyebrow && (
        <div className={cn(align === "center" ? "flex justify-center" : "flex")}>
          <Sticker>{eyebrow}</Sticker>
        </div>
      )}
      <h2 className="mt-5 font-display text-[1.9rem] font-bold leading-[1.08] tracking-[-0.025em] text-foreground text-balance sm:text-[2.6rem]">
        {title}
      </h2>
      {intro && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {intro}
        </p>
      )}
    </div>
  );
}

/** Highlighter span over a key word — butter by default (the one highlighter). */
export function Hl({
  children,
  tint = "butter",
}: {
  children: React.ReactNode;
  tint?: TintName;
}) {
  return (
    <span className="hl" style={{ ["--hl" as string]: TINT[tint].bg }}>
      {children}
    </span>
  );
}
