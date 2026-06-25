// Job descriptions arrive either as plain text (e.g. LinkedIn captures) or as fragments of
// HTML (e.g. Ashby). We don't render captured markup directly — it's untrusted and would need
// sanitizing — so this flattens it to readable text, preserving paragraph and list breaks. The
// detail page then renders the result as pre-wrapped prose.
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
}

/** Flatten an HTML fragment (or pass through plain text) into readable, break-preserving text. */
export function htmlToText(input: string): string {
  // Fast path: nothing that looks like a tag or entity, so it's already plain text.
  if (!/[<&]/.test(input)) return input.trim()

  let s = input
  s = s.replace(/<\s*li[^>]*>/gi, "• ") // list item → bullet
  s = s.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n") // block ends → newline
  s = s.replace(/<\s*\/?(ul|ol)[^>]*>/gi, "\n") // list boundaries → newline
  s = s.replace(/<[^>]+>/g, "") // drop any remaining tags
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  s = s.replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? "")
  s = s.replace(/[ \t]{2,}/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
  return s.trim()
}
