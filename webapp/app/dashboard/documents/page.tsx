import { getServerUserId } from "@/lib/auth/current-user"
import { listDocuments, toClientDocument } from "@/lib/server/documents"
import { DocumentsBrowser } from "@/components/dashboard/documents-browser"

// The user's uploaded documents (resumes, cover letters, …). Server-fetched, then handed to
// a client component that owns upload + delete.
export const dynamic = "force-dynamic"

export default async function DocumentsPage() {
  const userId = await getServerUserId()
  const documents = await listDocuments(userId)

  return <DocumentsBrowser documents={documents.map(toClientDocument)} />
}
