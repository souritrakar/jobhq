import mammoth from "mammoth"
import { extractText, getDocumentProxy } from "unpdf"

import { fileExtension } from "@/lib/validations/document"

/**
 * Extract plain text from an uploaded resume's bytes so the LLM can read it.
 *
 * Resumes arrive as binary documents (PDF/DOCX/…), not text, so we parse them server-side:
 *   - PDF  → unpdf (pure-JS pdf.js build; no native bindings, serverless-safe)
 *   - DOCX → mammoth (raw text, drops styling we don't need)
 *   - RTF / TXT → decode directly (RTF: strip control words best-effort)
 *
 * Formats we can't reliably parse without heavier deps (legacy .doc, .odt) return null — the
 * caller then generates a less-personalized letter rather than feeding the model binary garbage.
 * Selection is keyed on the file extension (authoritative here, as in upload validation) with the
 * MIME type as a fallback hint.
 */
export async function extractResumeText(
  bytes: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  const ext = fileExtension(fileName)
  const mime = mimeType.toLowerCase()

  try {
    if (ext === ".pdf" || mime.includes("pdf")) {
      return normalize(await extractPdf(bytes))
    }
    if (
      ext === ".docx" ||
      mime.includes("officedocument.wordprocessingml")
    ) {
      const { value } = await mammoth.extractRawText({ buffer: bytes })
      return normalize(value)
    }
    if (ext === ".rtf" || mime.includes("rtf")) {
      return normalize(stripRtf(bytes.toString("utf8")))
    }
    if (ext === ".txt" || mime.startsWith("text/")) {
      return normalize(bytes.toString("utf8"))
    }
  } catch (err) {
    console.error(`[resume-text] failed to parse ${fileName}:`, err)
    return null
  }

  // Legacy .doc / .odt and anything else: unsupported, fall back to a less-personalized letter.
  return null
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join("\n") : text
}

// Best-effort RTF → text: drop the binary/control scaffolding so the model sees readable prose.
function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, "") // hex-escaped bytes
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "") // control words
    .replace(/[{}]/g, "") // group braces
    .replace(/\\\r?\n/g, "\n")
}

// Collapse the runaway whitespace PDF/DOCX extraction tends to produce, and cap the length so a
// pathologically long document can't blow the prompt budget. Returns null if nothing meaningful
// survived (e.g. a scanned/image-only PDF with no text layer).
function normalize(raw: string): string | null {
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  if (text.length < 20) return null
  const MAX = 12_000 // ~3k tokens — generous for a resume, bounded for cost.
  return text.length > MAX ? `${text.slice(0, MAX)}\n…[truncated]` : text
}
