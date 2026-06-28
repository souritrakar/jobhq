"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { htmlToText } from "@/lib/html"
import { type Block, type Inline, looksFormatted, parseDescription } from "@/lib/description"

// Long descriptions collapse behind a fade so the application form below stays reachable
// without a long scroll; short ones render in full with no toggle.
const CLAMP_THRESHOLD = 520

/** The posting's description as readable prose, clamped with a fade + show-more when long. */
export function JobDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const text = htmlToText(description)
  const clampable = text.length > CLAMP_THRESHOLD
  // Greenhouse and similar boards post markdown (### headings, - bullets); render that as real
  // structure when detected, otherwise keep the plain pre-wrapped prose.
  const formatted = looksFormatted(text)

  return (
    <section aria-labelledby="about-heading" className="flex flex-col gap-3">
      <h2 id="about-heading" className="text-sm font-semibold tracking-tight">
        About the role
      </h2>
      <div
        className={cn(
          "relative text-[14px] leading-relaxed text-pretty text-foreground/90",
          !formatted && "whitespace-pre-wrap",
          formatted && "flex flex-col gap-3",
          !expanded && clampable && "max-h-72 overflow-hidden",
        )}
      >
        {formatted ? <FormattedDescription blocks={parseDescription(text)} /> : text}
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

function FormattedDescription({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          // Subsections live under the section's h2 "About the role", so they render as h3.
          return (
            <h3 key={i} className="mt-2 text-[13px] font-semibold tracking-tight text-foreground first:mt-0">
              <InlineSpans spans={block.spans} />
            </h3>
          )
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul"
          return (
            <ListTag
              key={i}
              className={cn(
                "flex flex-col gap-1 pl-5 marker:text-foreground/40",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineSpans spans={item} />
                </li>
              ))}
            </ListTag>
          )
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <InlineSpans spans={line} />
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

function InlineSpans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.kind === "strong") return <strong key={i} className="font-semibold text-foreground">{span.text}</strong>
        if (span.kind === "link") {
          return (
            <a
              key={i}
              href={span.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-fern-700 underline underline-offset-2 hover:text-fern-600"
            >
              {span.text}
            </a>
          )
        }
        return <span key={i}>{span.text}</span>
      })}
    </>
  )
}
