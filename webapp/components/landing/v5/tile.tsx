import { cn } from "@/lib/utils";
import { Reveal } from "../reveal";
import { TINT } from "./bits";

/* Bento tile — Dia register: big radius, generous padding, a tiny Pally tag
   naming the feature, quiet copy, and the vignette doing the talking.
   `tint` fills the whole tile; default is plain paper with a hairline. */

export function Tile({
  tag,
  tagTint = "fern",
  title,
  blurb,
  tint,
  className,
  delay = 0,
  children,
}: {
  tag: string;
  tagTint?: keyof typeof TINT;
  title: string;
  blurb?: string;
  tint?: keyof typeof TINT;
  className?: string;
  delay?: number;
  children?: React.ReactNode;
}) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border p-6 transition-shadow duration-300 hover:shadow-[0_30px_60px_-38px_rgba(20,40,25,0.5)] sm:p-7",
        tint ? "border-transparent" : "border-border bg-card",
        className,
      )}
      style={tint ? { backgroundColor: TINT[tint].bg } : undefined}
    >
      <span
        className="inline-flex w-fit items-center rounded-full px-2.5 py-1 font-[family-name:var(--font-pally)] text-[0.72rem] font-semibold"
        style={
          tint
            ? { backgroundColor: "rgba(255,255,255,0.75)", color: TINT[tint].ink }
            : { backgroundColor: TINT[tagTint].bg, color: TINT[tagTint].ink }
        }
      >
        {tag}
      </span>
      <h3 className="mt-4 font-display text-[1.15rem] font-bold leading-snug tracking-[-0.015em] text-foreground">
        {title}
      </h3>
      {blurb && (
        <p className="mt-1.5 max-w-[38ch] text-[0.9rem] leading-relaxed text-muted-foreground">
          {blurb}
        </p>
      )}
      {children && <div className="mt-5 flex-1">{children}</div>}
    </Reveal>
  );
}
