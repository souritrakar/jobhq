import { z } from "zod"

/**
 * Validation for document uploads. These constants are the single source of truth for
 * what counts as an acceptable document — imported by BOTH the client (to reject files
 * before upload and to drive the file picker's `accept` attribute) and the server (to
 * re-validate, since the client can never be trusted).
 *
 * Scope: resumes, cover letters, and similar — PDFs and the various Word/rich-text
 * document formats. We deliberately don't care what the document represents.
 */

/** Max upload size. Resumes/cover letters are small; this keeps a stray huge file out. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Allowed document types, keyed by file extension (lowercase, with dot). Each maps to the
 * MIME type(s) a browser/OS might report for it. Extension is the primary check because
 * browsers are inconsistent with MIME types (a .docx often arrives as
 * `application/octet-stream`), so we accept on extension and treat MIME as advisory.
 */
export const ALLOWED_DOCUMENT_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".rtf": ["application/rtf", "text/rtf"],
  ".odt": ["application/vnd.oasis.opendocument.text"],
}

/** Extensions as a list, e.g. for the `<input accept>` attribute: ".pdf,.doc,.docx,…". */
export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_DOCUMENT_TYPES)

/** Human-readable list for error/help copy, e.g. "PDF, DOC, DOCX, RTF, ODT". */
export const ALLOWED_LABEL = ALLOWED_EXTENSIONS.map((e) =>
  e.slice(1).toUpperCase(),
).join(", ")

/** Lowercased extension (with dot) of a filename, or "" if it has none. */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase()
}

/**
 * The canonical, server-trusted MIME type for an allowed document, derived from its (already
 * validated) extension — never from the client-sent `file.type`, which is attacker-controlled.
 * Storing this instead of the raw upload MIME stops a file from smuggling a dangerous
 * Content-Type (e.g. `text/html`, `image/svg+xml`) that the same-origin `/raw` route would later
 * echo back and execute. Unknown extensions fall back to the inert `application/octet-stream`.
 */
export function documentMimeType(fileName: string): string {
  const ext = fileExtension(fileName)
  return ALLOWED_DOCUMENT_TYPES[ext]?.[0] ?? "application/octet-stream"
}

/**
 * Validate an uploaded file's name and size. Returns an error message string when the file
 * is rejected, or `null` when it's acceptable. Shared by the client (pre-upload) and the
 * server (authoritative). MIME is intentionally not enforced — see ALLOWED_DOCUMENT_TYPES.
 */
export function validateDocumentFile(file: {
  name: string
  size: number
}): string | null {
  const ext = fileExtension(file.name)
  if (!ext || !(ext in ALLOWED_DOCUMENT_TYPES)) {
    return `Unsupported file type. Allowed: ${ALLOWED_LABEL}.`
  }
  if (file.size <= 0) {
    return "That file is empty."
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `File is too large. Max ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`
  }
  return null
}

/** Optional title sent alongside an upload; trimmed, capped, "" treated as absent. */
export const uploadTitleSchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v === "" ? undefined : v))
