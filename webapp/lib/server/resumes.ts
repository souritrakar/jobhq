import type { DocumentMeta } from "@/lib/server/documents"
import type { ResumeSummary } from "@/lib/resumes/types"
import { getDocumentText, listDocuments } from "@/lib/server/documents"
import { fileExtension } from "@/lib/validations/document"

/**
 * Resume service for the cover-letter generator. A "resume" is just one of the user's uploaded
 * documents (resumes, cover letters, …) surfaced for selection — there's no separate resume table.
 *
 * This is the seam the old lib/mock/resumes.ts stood in for. Listing reads metadata only (cheap,
 * server-rendered into the page). The plain text is parsed ONCE at upload and stored on the row
 * (lib/server/documents.ts), so resolving a resume's text is now just a DB read — no R2 fetch and
 * no re-parse per use.
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** Map a Document row to the picker's client-safe summary (no bytes). */
export function toResumeSummary(doc: DocumentMeta): ResumeSummary {
  const ext = fileExtension(doc.fileName).replace(".", "").toUpperCase()
  return {
    id: doc.id,
    name: doc.title,
    headline: [ext || "FILE", formatBytes(doc.size)].join(" · "),
    updatedAt: formatDate(doc.createdAt),
    // PENDING (legacy, not yet parsed) → unknown; otherwise readable only when text was stored.
    textReady: doc.textStatus === "PENDING" ? undefined : doc.textStatus === "READY",
  }
}

/** The user's documents, as selectable resumes (newest first). Metadata only. */
export async function listResumes(userId: string): Promise<ResumeSummary[]> {
  const docs = await listDocuments(userId)
  return docs.map(toResumeSummary)
}

/**
 * The plain-text content of a resume document, or null when it can't be used (unknown/foreign id,
 * or an unparseable format). The text was parsed once at upload and stored, so this is a plain
 * DB read; ownership is enforced (a resumeId the user doesn't own resolves to null rather than
 * leaking someone else's file). See getDocumentText for the one-time backfill of legacy rows.
 */
export async function getResumeText(
  userId: string,
  documentId: string,
): Promise<string | null> {
  return getDocumentText(userId, documentId)
}
