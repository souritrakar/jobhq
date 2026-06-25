"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { htmlToText } from "@/lib/html"

// Long descriptions collapse behind a fade so the application form below stays reachable
// without a long scroll; short ones render in full with no toggle.
const CLAMP_THRESHOLD = 520

/** The posting's description as readable prose, clamped with a fade + show-more when long. */
export function JobDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const text = htmlToText(description)
  const clampable = text.length > CLAMP_THRESHOLD

  return (
    <section aria-labelledby="about-heading" className="flex flex-col gap-3">
      <h2 id="about-heading" className="text-sm font-semibold tracking-tight">
        About the role
      </h2>
      <div
        className={cn(
          "relative whitespace-pre-wrap text-[14px] leading-relaxed text-pretty text-foreground/90",
          !expanded && clampable && "max-h-72 overflow-hidden",
        )}
      >
        {text}
        {!expanded && clampable && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-fern-700 transition-colors hover:text-fern-600"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </section>
  )
}
