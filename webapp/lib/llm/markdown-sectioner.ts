/**
 * Markdown → mdast → semantic sections → retrieval chunks.
 *
 * The extension's capture.js already serializes the live DOM into clean semantic markdown
 * (headings `##`, lists `- `, form controls `[dropdown: …]`). This module parses THAT markdown
 * into an mdast tree (remark) and walks it into hierarchical sections — splitting at headings,
 * carrying each section's full heading breadcrumb so the document tree is preserved as metadata.
 *
 * Why mdast and not an HTML partitioner (e.g. Unstructured.io):
 *  - We already hold curated markdown; there is no messy binary to OCR/layout-infer.
 *  - remark runs locally — no network round-trip, no per-call cost, no data egress, instant.
 *  - mdast exposes heading DEPTH, so we recover real hierarchy (h1 ▸ h2 ▸ h3), not a flat list.
 *
 * Pure + dependency-light: parsing has no I/O, so it unit-tests directly.
 */

import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import { toString as mdToString } from "mdast-util-to-string"
import type { Root, RootContent, List, Table } from "mdast"

export type SectionRole =
  | "header"
  | "job_description"
  | "requirements"
  | "benefits"
  | "application_form"
  | "other"

/** One contiguous block of the document, bounded by the heading that opened it. */
export interface Section {
  /** Inferred semantic role from the heading text (keyword heuristic; defaults to position). */
  role: SectionRole
  /** The heading text that opened this section (undefined for the pre-heading lead block). */
  heading?: string
  /** Full breadcrumb from the document root to this heading, e.g. ["Requirements", "Nice to have"]. */
  headingPath: string[]
  /** Heading depth (1 = h1 … 6 = h6); 0 for the pre-heading lead block. */
  depth: number
  /** Reading-order index among sections (stable id basis + final ordering). */
  position: number
  /** Rendered text of the section, heading line included, structure-preserving. */
  text: string
  estimatedTokens: number
}

/** A retrieval unit: a section, or a slice of an over-long section. Embedding attached later. */
export interface RetrievalChunk {
  id: string
  sectionRole: SectionRole
  sectionHeading?: string
  /** Heading breadcrumb, copied from the source section — survives chunk splitting. */
  headingPath: string[]
  text: string
  estimatedTokens: number
  /** Reading-order position of the source section (for coherent context re-assembly). */
  position: number
  embedding?: number[]
}

/** Rough token estimate (≈4 chars/token for English). Cheap and good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Parse semantic markdown into ordered sections, split at every heading. Each section carries
 * its heading breadcrumb so the document hierarchy is preserved even though the list is flat.
 */
export function parseMarkdownToSections(markdown: string): Section[] {
  const md = (markdown || "").trim()
  if (!md) return []

  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as Root

  const sections: Section[] = []
  // Heading breadcrumb stack: entries are { depth, text } for headings currently "open".
  const stack: Array<{ depth: number; text: string }> = []

  let current: { heading?: string; depth: number; role: SectionRole; lines: string[] } | null = null
  const open = (heading: string | undefined, depth: number, role: SectionRole) => {
    current = { heading, depth, role, lines: [] }
  }
  const flush = () => {
    if (!current) return
    const text = current.lines.join("\n").trim()
    // Drop sections that ended up with nothing but their (already-captured) heading line removed.
    if (text) {
      sections.push({
        role: current.role,
        heading: current.heading,
        headingPath: stack.map((s) => s.text),
        depth: current.depth,
        position: sections.length,
        text,
        estimatedTokens: estimateTokens(text),
      })
    }
    current = null
  }

  for (const node of tree.children) {
    if (node.type === "heading") {
      const text = mdToString(node).replace(/\s+/g, " ").trim()
      // Close the section the previous heading opened.
      flush()
      // Maintain the breadcrumb: pop siblings/deeper headings, then push this one.
      while (stack.length && stack[stack.length - 1].depth >= node.depth) stack.pop()
      // The breadcrumb for THIS section is the ancestors plus itself.
      stack.push({ depth: node.depth, text })
      open(text, node.depth, detectSectionRole(text))
      // Seed the section body with its heading line so retrieved context reads naturally.
      if (current) (current as any).lines.push(text)
      continue
    }

    // Content node. If it arrives before any heading, it's the lead/header block.
    if (!current) open(undefined, 0, "header")
    const rendered = renderBlock(node)
    if (rendered && current) (current as { lines: string[] }).lines.push(rendered)
  }
  flush()

  return sections
}

/**
 * Group sections into retrieval chunks. A section that fits the budget becomes one chunk;
 * an over-long section is split along its block (line) boundaries with a small overlap so a
 * concept straddling the cut still appears in both neighbours.
 */
export function createRetrievalChunks(
  sections: Section[],
  opts?: { maxChunkTokens?: number; overlapTokens?: number },
): RetrievalChunk[] {
  const maxTokens = opts?.maxChunkTokens ?? 800
  const overlapTokens = opts?.overlapTokens ?? 60
  const chunks: RetrievalChunk[] = []

  for (const section of sections) {
    if (section.estimatedTokens <= maxTokens) {
      chunks.push(chunkFromSection(section, section.text, chunks.length))
      continue
    }
    for (const slice of splitText(section.text, maxTokens, overlapTokens)) {
      chunks.push(chunkFromSection(section, slice, chunks.length))
    }
  }

  return chunks
}

// ---- internals ---------------------------------------------------------------------------------

function chunkFromSection(section: Section, text: string, seq: number): RetrievalChunk {
  return {
    id: `chunk-${seq}`,
    sectionRole: section.role,
    sectionHeading: section.heading,
    headingPath: section.headingPath,
    text: text.trim(),
    estimatedTokens: estimateTokens(text),
    position: section.position,
  }
}

/**
 * Render a single mdast block to structure-preserving text. mdast-util-to-string alone would
 * flatten lists/tables into a run-on line, losing the very structure we want the model to see —
 * so lists keep their `- ` markers and tables keep ` | ` cell separators.
 */
function renderBlock(node: RootContent): string {
  switch (node.type) {
    case "paragraph":
      return mdToString(node).replace(/\s+/g, " ").trim()

    case "list":
      return renderList(node as List)

    case "table":
      return renderTable(node as Table)

    case "code":
      return (node.value || "").trim()

    case "blockquote": {
      const inner = mdToString(node).replace(/\s+/g, " ").trim()
      return inner ? `> ${inner}` : ""
    }

    case "thematicBreak":
      return ""

    default: {
      // html, definition, footnote, etc. — keep any text content, drop the rest.
      const t = mdToString(node).replace(/\s+/g, " ").trim()
      return t
    }
  }
}

function renderList(list: List): string {
  const ordered = !!list.ordered
  const lines: string[] = []
  list.children.forEach((item, i) => {
    const text = mdToString(item).replace(/\s+/g, " ").trim()
    if (text) lines.push(ordered ? `${i + 1}. ${text}` : `- ${text}`)
  })
  return lines.join("\n")
}

function renderTable(table: Table): string {
  return table.children
    .map((row) =>
      row.children.map((cell) => mdToString(cell).replace(/\s+/g, " ").trim()).join(" | "),
    )
    .filter((line) => line.replace(/\s*\|\s*/g, "").length > 0)
    .join("\n")
}

/**
 * Split a block of text into ≤maxTokens slices along line boundaries, carrying `overlapTokens`
 * worth of trailing lines into the next slice. A single over-long line is hard-cut by characters.
 */
function splitText(text: string, maxTokens: number, overlapTokens: number): string[] {
  const lines = text.split("\n")
  const slices: string[] = []
  let buf: string[] = []
  let bufTokens = 0

  const overlapChars = overlapTokens * 4

  for (const line of lines) {
    const lineTokens = estimateTokens(line)

    if (bufTokens + lineTokens > maxTokens && buf.length > 0) {
      const slice = buf.join("\n")
      slices.push(slice)
      // Seed the next buffer with a tail overlap from the slice just emitted.
      const tail = slice.slice(-overlapChars)
      buf = tail ? [tail] : []
      bufTokens = estimateTokens(buf.join("\n"))
    }

    if (lineTokens > maxTokens) {
      // Pathologically long single line — hard-cut by characters.
      const maxChars = maxTokens * 4
      for (let i = 0; i < line.length; i += maxChars) {
        slices.push(line.slice(i, i + maxChars))
      }
      continue
    }

    buf.push(line)
    bufTokens += lineTokens
  }

  if (buf.length > 0) slices.push(buf.join("\n"))
  return slices
}

/**
 * Infer a section's semantic role from its heading text. Heuristic and order-sensitive: the
 * checks run from most-specific to least so e.g. "Application questions" wins over "About".
 * Unknown headings fall to "other" — retrieval still reaches them via embeddings.
 */
export function detectSectionRole(headingText: string): SectionRole {
  const t = headingText.toLowerCase()

  if (/(requirement|qualification|skills?|must[- ]?have|what you('|’)?ll need|who you are|experience)/.test(t))
    return "requirements"

  if (/(benefit|compensation|perks?|salary|what we offer|pay|package|why join)/.test(t))
    return "benefits"

  if (/(application|apply|questions?|how to apply|submit)/.test(t))
    return "application_form"

  if (/(about|description|role|responsibilit|overview|what you('|’)?ll do|the job|summary|mission)/.test(t))
    return "job_description"

  return "other"
}
