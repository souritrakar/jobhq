import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ApiError } from "@/lib/api/errors"
import { created, ok, preflight, withRoute } from "@/lib/api/route"
import { createDocument, listDocuments, toClientDocument } from "@/lib/server/documents"
import { documentMimeType, uploadTitleSchema, validateDocumentFile } from "@/lib/validations/document"

// GET /api/documents — list the current user's uploaded documents.
export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const docs = await listDocuments(userId)
  return ok(docs.map(toClientDocument))
})

// POST /api/documents — upload a document (multipart/form-data: `file`, optional `title`).
export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!form || !(file instanceof File)) {
    throw ApiError.badRequest("No file provided. Send it as multipart form field `file`.")
  }

  // Re-validate server-side — the client check is a convenience, never a guarantee.
  const problem = validateDocumentFile({ name: file.name, size: file.size })
  if (problem) throw ApiError.badRequest(problem)

  const title = uploadTitleSchema.parse(form.get("title") ?? undefined)
  const body = Buffer.from(await file.arrayBuffer())

  const doc = await createDocument(
    userId,
    {
      fileName: file.name,
      // Derive the MIME from the validated extension — never trust the client's `file.type`,
      // which can smuggle a `text/html` Content-Type into the same-origin `/raw` route.
      mimeType: documentMimeType(file.name),
      size: file.size,
      body,
    },
    title,
  )
  return created(toClientDocument(doc))
})

export const OPTIONS = preflight
