import { randomUUID } from "node:crypto"

import type { Document, DocumentTextStatus, Prisma } from "@prisma/client"

import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import type { ClientDocument } from "@/lib/documents/types"
import { extractResumeText } from "@/lib/server/resume-text"
import { documentStorage } from "@/lib/server/storage/document-storage"
import { fileExtension } from "@/lib/validations/document"

/**
 * Documents service / repository layer.
 *
 * All database AND storage access for documents lives here, never in route handlers.
 * Same multi-tenant rules as the rest of the app: every function takes `userId` and scopes
 * its query to it, and a specific document is always fetched by BOTH `id` and `userId`, so a
 * user can never touch another user's file even if they guess an id.
 *
 * Bytes vs. metadata: the file bytes go to the pluggable storage provider
 * (lib/server/storage/document-storage.ts); the row here is just metadata + the `storageKey`
 * that addresses those bytes.
 */

/** The URL any part of the app can GET to stream a document's bytes. */
export function documentUrl(id: string): string {
  return `/api/documents/${id}/raw`
}

// Every Document column EXCEPT the heavy `extractedText` — the shape lists/serializers use. Read
// via an explicit `select` (not `omit`, which this Prisma client build doesn't accept) so a list
// never drags ~12 KB of parsed text per row out of the database.
const DOCUMENT_META_SELECT = {
  id: true,
  userId: true,
  title: true,
  fileName: true,
  mimeType: true,
  size: true,
  storageKey: true,
  storageProvider: true,
  textStatus: true,
  extractedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect

/** The Document columns the client-facing serializers read (never the heavy `extractedText`). */
export type DocumentMeta = Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_META_SELECT }>

/** Serialize a Prisma row into the client shape. The single place this mapping happens. */
export function toClientDocument(doc: DocumentMeta): ClientDocument {
  return {
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    createdAt: doc.createdAt.toISOString(),
    url: documentUrl(doc.id),
  }
}

export async function listDocuments(userId: string): Promise<DocumentMeta[]> {
  // Lists never need the parsed text — omit it so a page of resumes doesn't drag ~12 KB of text
  // per row over the wire. The text is read on its own (getDocumentText) only when an AI step uses it.
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: DOCUMENT_META_SELECT,
  })
}

async function getDocumentRow(userId: string, id: string): Promise<Document> {
  const doc = await prisma.document.findFirst({ where: { id, userId } })
  if (!doc) throw ApiError.notFound("Document not found")
  return doc
}

/** Default a document title from its filename (drop the extension, fall back to the name). */
function titleFromFileName(fileName: string): string {
  const ext = fileExtension(fileName)
  const base = ext ? fileName.slice(0, -ext.length) : fileName
  return base.trim() || fileName
}

// Formats we knowingly can't parse to text — flagged distinctly so the UI can say "we couldn't
// read this file" rather than silently treating it like an empty resume.
const UNSUPPORTED_TEXT_EXTENSIONS = new Set([".doc", ".odt"])

/**
 * Parse a document's bytes to plain text ONCE so it can be stored and reused. Never throws —
 * a parse failure is captured as a status, not an error, so it can't break an upload. The
 * status disambiguates the `null` text: UNSUPPORTED (format we don't parse), EMPTY (parsed but
 * nothing usable, e.g. a scanned PDF), or FAILED (the parser threw).
 */
async function deriveDocumentText(
  body: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ text: string | null; status: DocumentTextStatus }> {
  if (UNSUPPORTED_TEXT_EXTENSIONS.has(fileExtension(fileName))) {
    return { text: null, status: "UNSUPPORTED" }
  }
  try {
    const text = await extractResumeText(body, fileName, mimeType)
    return text ? { text, status: "READY" } : { text: null, status: "EMPTY" }
  } catch (err) {
    console.error(`[documents] text extraction failed for ${fileName}:`, err)
    return { text: null, status: "FAILED" }
  }
}

export async function createDocument(
  userId: string,
  file: { fileName: string; mimeType: string; size: number; body: Buffer },
  title?: string,
): Promise<Document> {
  const storage = documentStorage()
  // A unique key per upload so two files with the same name never collide. The provider
  // treats this as opaque; the `documents/<userId>/...` shape just keeps stores browsable.
  const key = `documents/${userId}/${randomUUID()}/${file.fileName}`

  // Store the bytes FIRST. If the provider throws (e.g. the unconfigured stub), we never
  // create a dangling metadata row pointing at bytes that don't exist.
  await storage.put({ key, body: file.body, contentType: file.mimeType })

  // Extract the text ONCE here, at upload, and store it alongside the metadata — every later
  // AI use reads it from the DB instead of re-fetching the bytes from R2 and re-parsing.
  const { text, status } = await deriveDocumentText(file.body, file.fileName, file.mimeType)

  return prisma.document.create({
    data: {
      userId,
      title: title ?? titleFromFileName(file.fileName),
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
      storageKey: key,
      storageProvider: storage.provider,
      extractedText: text,
      textStatus: status,
      extractedAt: new Date(),
    },
  })
}

/**
 * A document's extracted plain text, or null when it has none usable (unknown/foreign id, or a
 * format that yielded no text). Ownership is enforced — a document the user doesn't own resolves
 * to null. Reads the text persisted at upload; only a legacy row never processed (textStatus
 * PENDING) triggers a one-time parse, which is then backfilled so it never happens twice.
 */
export async function getDocumentText(
  userId: string,
  id: string,
): Promise<string | null> {
  const doc = await prisma.document.findFirst({
    where: { id, userId },
    select: { storageKey: true, fileName: true, mimeType: true, extractedText: true, textStatus: true },
  })
  if (!doc) return null
  // Already processed (READY → text; EMPTY/UNSUPPORTED/FAILED → null). No bytes touched.
  if (doc.textStatus !== "PENDING") return doc.extractedText

  // Legacy row uploaded before extraction-at-upload existed: parse now and persist the result.
  let body: Buffer
  try {
    ;({ body } = await documentStorage().get(doc.storageKey))
  } catch {
    return null
  }
  const { text, status } = await deriveDocumentText(body, doc.fileName, doc.mimeType)
  await prisma.document.update({
    where: { id },
    data: { extractedText: text, textStatus: status, extractedAt: new Date() },
  })
  return text
}

/** Fetch a document's bytes (for the raw/download route). Scoped to the owner. */
export async function getDocumentContent(
  userId: string,
  id: string,
): Promise<{ body: Buffer; contentType: string; fileName: string }> {
  const doc = await getDocumentRow(userId, id)
  const { body, contentType } = await documentStorage().get(doc.storageKey)
  return { body, contentType: contentType || doc.mimeType, fileName: doc.fileName }
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  const doc = await getDocumentRow(userId, id)
  // Best-effort byte cleanup before dropping the row. If the bytes are already gone this
  // shouldn't block the user from removing the entry, so a storage failure is non-fatal.
  try {
    await documentStorage().delete(doc.storageKey)
  } catch (err) {
    console.error("[documents] failed to delete stored bytes:", err)
  }
  await prisma.document.delete({ where: { id } })
}
