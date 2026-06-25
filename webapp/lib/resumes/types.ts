/**
 * The resume shape the cover-letter picker renders. A resume is just one of the user's uploaded
 * documents (lib/server/documents.ts) surfaced for selection — this is the client-safe summary
 * (no file bytes, no server imports), so both the server (listing) and the client (the picker)
 * can speak it.
 */
export type ResumeSummary = {
  /** The backing Document id — what generation resolves the resume text from. */
  id: string
  /** Display name (the document title, e.g. "Alex Chen — Backend Engineer"). */
  name: string
  /** One muted line: file type + size, e.g. "PDF · 248 KB". */
  headline: string
  /** Pre-formatted "last updated" label, e.g. "Jun 24, 2026". */
  updatedAt: string
  /**
   * Whether we extracted usable text from this document. False means the file was unreadable
   * (a scanned/image-only PDF, or a legacy .doc/.odt) — selecting it still works, but the AI
   * features can't personalize from it, so the picker can warn. (Undefined = unknown/legacy.)
   */
  textReady?: boolean
}
