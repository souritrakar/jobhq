import { cn } from "@/lib/utils";

type ScribbleProps = React.SVGProps<SVGSVGElement>;

/** Hand-drawn underline swoosh — sits under a highlighted word. */
export function Underline({ className, ...props }: ScribbleProps) {
  return (
    <svg
      viewBox="0 0 240 24"
      fill="none"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <path
        d="M3 16.5C46 9 120 4.5 167 7.5c20 1.3 48 4 70 9.5C210 14 150 12 120 13c-36 1.2-78 4-92 7"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Loose circle drawn around something for emphasis. */
export function CircleScribble({ className, ...props }: ScribbleProps) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <path
        d="M118 8c-37-6-79-3-95 18-13 17-7 44 18 60 30 19 86 22 122 4 28-14 33-44 12-64C160 6 120 4 96 6"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Curved arrow pointing toward a CTA. */
export function ArrowDoodle({ className, ...props }: ScribbleProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <path
        d="M10 12c34 6 68 24 80 56"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M70 64c8 3 15 4 22 4M92 68c-4-7-7-14-7-22"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four-point sparkle / twinkle. */
export function Sparkle({ className, ...props }: ScribbleProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <path
        d="M16 2c1.4 7.2 4.6 10.4 11.8 11.8C20.6 15.2 17.4 18.4 16 25.6 14.6 18.4 11.4 15.2 4.2 13.8 11.4 12.4 14.6 9.2 16 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A messy pile of overlapping browser tabs — the "lost in tabs" chaos. */
export function TabsDoodle({ className, ...props }: ScribbleProps) {
  return (
    <svg viewBox="0 0 120 90" fill="none" aria-hidden className={cn("h-auto w-full", className)} {...props}>
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 30h40l8 9v34a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" transform="rotate(-7 38 56)" />
        <path d="M40 20h42l8 9v36a3 3 0 0 1-3 3H43a3 3 0 0 1-3-3z" transform="rotate(5 64 48)" />
        <path d="M66 34h36l7 8v30a3 3 0 0 1-3 3H69a3 3 0 0 1-3-3z" transform="rotate(-3 86 60)" />
      </g>
    </svg>
  );
}

/** A reminder bell with a slash through it — a missed/broken nudge. */
export function BellDoodle({ className, ...props }: ScribbleProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden className={cn("h-auto w-full", className)} {...props}>
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 32c-2 0-3-2-1-4 2-1 3-3 3-6v-3a8 8 0 0 1 16 0v3c0 3 1 5 3 6 2 2 1 4-1 4z" />
        <path d="M20 36a4 4 0 0 0 8 0" />
        <path d="M9 11l30 26" opacity="0.85" />
      </g>
    </svg>
  );
}

/** A small calendar / date page — for deadlines & reminders. */
export function CalendarDoodle({ className, ...props }: ScribbleProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden className={cn("h-auto w-full", className)} {...props}>
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="12" width="30" height="28" rx="4" />
        <path d="M9 20h30M17 8v8M31 8v8" />
        <path d="M19 30l3 3 7-7" />
      </g>
    </svg>
  );
}

/** A hand-drawn bookmark — for "saved but trapped". */
export function BookmarkDoodle({ className, ...props }: ScribbleProps) {
  return (
    <svg viewBox="0 0 40 48" fill="none" aria-hidden className={cn("h-auto w-full", className)} {...props}>
      <path d="M11 8h18a3 3 0 0 1 3 3v29l-12-9-12 9V11a3 3 0 0 1 3-3z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A lightning bolt — for the "AI / auto" tools. */
export function BoltDoodle({ className, ...props }: ScribbleProps) {
  return (
    <svg viewBox="0 0 40 48" fill="none" aria-hidden className={cn("h-auto w-full", className)} {...props}>
      <path d="M24 6 10 28h10l-4 16 18-24H22z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A loose hand-drawn checkmark — for "done" / structured. */
export function CheckScribble({ className, ...props }: ScribbleProps) {
  return (
    <svg viewBox="0 0 32 28" fill="none" aria-hidden className={cn("h-auto w-full", className)} {...props}>
      <path d="M4 15c3 1 7 5 9 9 3-12 8-18 15-22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Small energetic squiggle / accent strokes. */
export function Squiggle({ className, ...props }: ScribbleProps) {
  return (
    <svg
      viewBox="0 0 60 24"
      fill="none"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <path
        d="M3 18C9 6 13 6 19 14s10 8 16-2 9-8 15 0"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
