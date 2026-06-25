import { cn } from "@/lib/utils";

/** Hand-drawn ink characters (Open Peeps) recolored to warm ink. */
const PEEPS = {
  shrug: "/landing/peeps/peep-shrug.svg",
  stand: "/landing/peeps/peep-stand.svg",
  sit: "/landing/peeps/peep-sit.svg",
} as const;

type PeepProps = {
  name: keyof typeof PEEPS;
  className?: string;
  /** Gentle idle float + tilt. */
  float?: boolean;
  style?: React.CSSProperties;
};

/**
 * Renders one of the recurring hand-drawn cast members. Black-ink line art on
 * transparent — reads as a sketch in a field guide, the human warmth that sets
 * the product apart from sterile competitors.
 */
export function Peep({ name, className, float = false, style }: PeepProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={PEEPS[name]}
      alt=""
      aria-hidden
      style={style}
      className={cn(
        "pointer-events-none select-none",
        float && "animate-float-tilt",
        className,
      )}
    />
  );
}
