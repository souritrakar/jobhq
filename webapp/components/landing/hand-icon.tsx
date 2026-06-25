import { cn } from "@/lib/utils";

type HandIconProps = {
  /** File name (without extension) inside /public/icons. */
  name: string;
  className?: string;
  /** When true, recolor the line art to the current text color via masking. */
  tint?: boolean;
};

/**
 * Renders one of the hand-drawn Notion-style icons from /public/icons.
 * By default shows the original ink art; with `tint` it adopts `currentColor`
 * so it can be painted Fern green (or any text color) by its parent.
 */
export function HandIcon({ name, className, tint = false }: HandIconProps) {
  const src = `/icons/${name}.svg`;
  if (tint) {
    return (
      <span
        aria-hidden
        className={cn("scribble inline-block", className)}
        style={{
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden className={cn("inline-block", className)} />
  );
}
