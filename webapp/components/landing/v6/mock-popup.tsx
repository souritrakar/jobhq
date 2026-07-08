import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoChip } from "./bits";

/* The extension save popup, rendered as a believable mini-product in the
   Circleback panel register: white surface, gray labels left / dark values
   right, generous row spacing (no hairline under every row), tiny outlined
   meta chips, one fern CTA. */

const FIELDS: { label: string; value: React.ReactNode }[] = [
  { label: "Company", value: (
    <span className="flex items-center gap-1.5">
      <LogoChip slug="linear" className="size-4" />
      Linear
    </span>
  ) },
  { label: "Location", value: "Remote, North America" },
  { label: "Salary", value: "$170k to $210k" },
  { label: "Deadline", value: "Friday, Jul 10" },
  { label: "Questions", value: "6 captured" },
];

export function MockPopup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-[300px] overflow-hidden rounded-xl border border-black/[0.08] bg-white text-left shadow-[0_2px_6px_rgba(15,30,20,0.06),0_24px_50px_-20px_rgba(15,30,20,0.35)]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-2.5">
        <span className="grid size-5 place-items-center rounded-md bg-primary text-[0.6rem] font-bold text-primary-foreground">
          J
        </span>
        <span className="text-[0.8rem] font-semibold text-foreground">Save to jobhq</span>
        <span className="ml-auto flex gap-2 text-[0.68rem] text-foreground/40">
          <span className="border-b-2 border-primary pb-0.5 font-medium text-foreground">Details</span>
          <span>Application</span>
          <span>Resume</span>
        </span>
      </div>

      <div className="px-4 py-3">
        <h4 className="text-[0.92rem] font-semibold leading-snug tracking-tight text-foreground">
          Senior Frontend Engineer
        </h4>
        <p className="mt-1 flex items-center gap-1 text-[0.66rem] text-foreground/50">
          <Check className="size-3 text-primary" strokeWidth={2.4} aria-hidden />
          Auto-filled from this page
        </p>

        <dl className="mt-2.5 flex flex-col gap-[3px]">
          {FIELDS.map((f) => (
            <div
              key={f.label}
              className="flex items-center justify-between gap-3 py-[5px]"
            >
              <dt className="text-[0.7rem] text-foreground/45">{f.label}</dt>
              <dd className="text-[0.72rem] font-medium text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-2 flex flex-wrap gap-1">
          {["Full-time", "Remote", "React", "TypeScript"].map((t) => (
            <span
              key={t}
              className="rounded-full border border-black/[0.08] px-2 py-[3px] text-[0.62rem] text-foreground/55"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 py-1.5 text-[0.7rem] font-medium text-foreground">
            Saved
            <ChevronDown className="size-3 text-foreground/40" aria-hidden />
          </span>
          <span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-[0.74rem] font-semibold text-primary-foreground">
            <Check className="size-3.5" strokeWidth={2.6} aria-hidden />
            Save application
          </span>
        </div>
      </div>
    </div>
  );
}
