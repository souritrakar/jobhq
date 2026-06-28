// Job descriptions reach us as plain text, flattened HTML (via htmlToText), or lightweight
// markdown — e.g. Greenhouse posts `### Required Qualifications:` headings and `- bullet`
// lists. When such formatting markers are present we parse them deterministically into a
// small block AST that the detail page renders as real headings/lists. We never feed the
// source through dangerouslySetInnerHTML, so untrusted posting text can't inject markup —
// only the structure we recognize is rebuilt, everything else stays literal text.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string }

export type Block =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "paragraph"; lines: Inline[][] }

// `### Heading` / `## Heading` (trailing `#` closers tolerated, ATX-style).
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
// Unordered item: markdown markers plus the `•`/`‣`/`●` bullets htmlToText emits from <li>.
const BULLET = /^[-*+•‣●·]\s+(.+)$/
// Ordered item: `1. text` or `1) text`.
const ORDERED = /^\d+[.)]\s+(.+)$/

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/
const STRONG = /\*\*([^*\n]+)\*\*|__([^_\n]+)__/

/** True when the text carries markdown/list markers worth rendering as real structure. */
export function looksFormatted(text: string): boolean {
  const formattedLine = text.split("\n").some((line) => {
    const l = line.trim()
    return HEADING.test(l) || BULLET.test(l) || ORDERED.test(l)
  })
  return formattedLine || STRONG.test(text)
}

/** Split a single line of text into inline spans (bold + http links), leaving the rest literal. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    const link = LINK.exec(rest)
    const strong = STRONG.exec(rest)
    const matches = [link, strong].filter((m): m is RegExpExecArray => m !== null)
    if (!matches.length) {
      out.push({ kind: "text", text: rest })
      break
    }
    const next = matches.reduce((a, b) => (a.index <= b.index ? a : b))
    if (next.index > 0) out.push({ kind: "text", text: rest.slice(0, next.index) })
    if (next === link) {
      out.push({ kind: "link", text: link![1], href: link![2] })
    } else {
      out.push({ kind: "strong", text: (strong![1] ?? strong![2]) })
    }
    rest = rest.slice(next.index + next[0].length)
  }
  return out.filter((n) => !(n.kind === "text" && n.text === ""))
}

/**
 * Parse description text into a block list. Consecutive bullet/number lines collapse into a
 * single list; consecutive plain lines become one paragraph (internal breaks preserved); a
 * blank line ends the current block. Safe to run on any text — unrecognized lines stay as
 * paragraph prose.
 */
export function parseDescription(text: string): Block[] {
  const blocks: Block[] = []
  let para: Inline[][] = []
  let list: { ordered: boolean; items: Inline[][] } | null = null

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "paragraph", lines: para })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items })
      list = null
    }
  }
  const flushAll = () => {
    flushPara()
    flushList()
  }

  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) {
      flushAll()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushAll()
      blocks.push({ kind: "heading", level: heading[1].length, spans: parseInline(heading[2]) })
      continue
    }

    const bullet = BULLET.exec(line)
    if (bullet) {
      flushPara()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(parseInline(bullet[1]))
      continue
    }

    const ordered = ORDERED.exec(line)
    if (ordered) {
      flushPara()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(parseInline(ordered[1]))
      continue
    }

    flushList()
    para.push(parseInline(line))
  }

  flushAll()
  return blocks
}
