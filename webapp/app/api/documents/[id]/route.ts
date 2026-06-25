import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { deleteDocument } from "@/lib/server/documents"

type Ctx = { params: Promise<{ id: string }> }

// DELETE /api/documents/:id — remove a document (metadata + stored bytes).
export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = getUserId(req)
  const { id } = await params
  await deleteDocument(userId, id)
  return ok({ id, deleted: true })
})

export const OPTIONS = preflight
