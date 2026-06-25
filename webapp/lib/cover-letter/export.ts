/**
 * Client-side export helpers for a generated cover letter — zero dependencies.
 *
 * - copyText: clipboard.
 * - downloadDocx: builds a genuine, minimal OOXML (.docx) in the browser. A .docx is a ZIP of XML
 *   parts; we assemble the three required parts and pack them with a tiny "stored" (uncompressed)
 *   ZIP writer + CRC-32. Word, Pages, and Google Docs all open the result. No `docx`/JSZip needed.
 * - printPdf: opens a print-styled window and triggers the browser's print dialog, where the user
 *   picks "Save as PDF" — the dependency-free path to a clean PDF.
 *
 * All three run only in the browser (they touch `document`/`window`/`navigator`).
 */

// Turn a job/company into a safe, friendly base filename, e.g. "Cover Letter - Acme - Engineer".
export function coverLetterFilename(company: string, title: string): string {
  const clean = (s: string) =>
    s.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, " ").slice(0, 60)
  const parts = ["Cover Letter", clean(company), clean(title)].filter(Boolean)
  return parts.join(" - ") || "Cover Letter"
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/** Split a letter into paragraph lines; blank lines are preserved as spacing. */
function toLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── .docx ──────────────────────────────────────────────────────────────────

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>"

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>"

function buildDocumentXml(text: string): string {
  const paragraphs = toLines(text)
    .map((line) => {
      if (line.trim() === "") return "<w:p/>"
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    })
    .join("")
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${paragraphs}<w:sectPr/></w:body>` +
    "</w:document>"
  )
}

export function downloadDocx(text: string, baseName: string): void {
  const enc = new TextEncoder()
  const files: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "word/document.xml", data: enc.encode(buildDocumentXml(text)) },
  ]
  const blob = new Blob([zip(files) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
  triggerDownload(blob, `${baseName}.docx`)
}

// ── PDF (via the print dialog) ───────────────────────────────────────────────

export function printPdf(text: string, title: string): void {
  const win = window.open("", "_blank", "noopener,noreferrer,width=820,height=900")
  if (!win) {
    // Pop-up blocked — fall back so the user still gets the file.
    downloadDocx(text, title)
    return
  }
  // Build the print document with DOM APIs (not document.write): paragraph text goes through
  // `textContent`, so the letter — even with `<`, `&`, etc. — can never be interpreted as markup.
  const doc = win.document
  doc.title = title

  const style = doc.createElement("style")
  style.textContent =
    "@page{margin:1in;}" +
    "html,body{margin:0;}" +
    "body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.55;color:#111;max-width:7in;margin:0 auto;padding:0.25in;}" +
    "p{margin:0 0 0.75em;white-space:pre-wrap;}"
  doc.head.appendChild(style)

  for (const line of toLines(text)) {
    const p = doc.createElement("p")
    // Non-breaking space keeps an empty paragraph from collapsing; set as text, never as markup.
    p.textContent = line.trim() === "" ? " " : line
    doc.body.appendChild(p)
  }

  // Let layout settle before invoking print, then close the helper window afterward.
  win.focus()
  win.setTimeout(() => {
    win.print()
    win.setTimeout(() => win.close(), 300)
  }, 250)
}

// ── shared ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has grabbed the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── minimal "stored" ZIP writer (no compression) + CRC-32 ────────────────────

type ZipEntry = { name: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// Pack entries into a valid ZIP using the "stored" method (compression 0). Small XML parts don't
// benefit from compression, and storing them sidesteps a deflate dependency while staying spec-valid.
function zip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0x21, true) // mod date (1980-01-01)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true) // compressed size == size (stored)
    lv.setUint32(22, size, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(nameBytes, 30)

    chunks.push(local, entry.data)

    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true) // central dir header signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true) // flags
    cv.setUint16(10, 0, true) // method
    cv.setUint16(12, 0, true) // mod time
    cv.setUint16(14, 0x21, true) // mod date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    cd.set(nameBytes, 46)
    central.push(cd)

    offset += local.length + entry.data.length
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central dir signature
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with central dir
  ev.setUint16(8, entries.length, true) // records on this disk
  ev.setUint16(10, entries.length, true) // total records
  ev.setUint32(12, centralSize, true) // central dir size
  ev.setUint32(16, offset, true) // central dir offset
  ev.setUint16(20, 0, true) // comment length

  const total =
    chunks.reduce((n, c) => n + c.length, 0) + centralSize + end.length
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  for (const c of central) {
    out.set(c, p)
    p += c.length
  }
  out.set(end, p)
  return out
}
