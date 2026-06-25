"use client"

import { useRef, useState } from "react"
import {
  Download,
  FileText,
  LoaderCircle,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { deleteDocument, uploadDocument } from "@/lib/documents/client"
import type { ClientDocument } from "@/lib/documents/types"
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_LABEL,
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
} from "@/lib/validations/document"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const ACCEPT = ALLOWED_EXTENSIONS.join(",")
const MAX_MB = MAX_DOCUMENT_BYTES / (1024 * 1024)

// Documents page: upload + manage files (resumes, cover letters, …). The list is fetched on
// the server and passed in; this owns a working copy so uploads/deletes reflect immediately
// (and roll back on failure). Storage of the bytes is pluggable server-side — if no provider
// is wired yet, uploads fail with a clear message surfaced in the error banner.
export function DocumentsBrowser({
  documents: initial,
}: {
  documents: ClientDocument[]
}) {
  const [documents, setDocuments] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)

    const files = Array.from(fileList)
    // Reject anything invalid up front so one bad file doesn't start a partial upload run.
    for (const file of files) {
      const problem = validateDocumentFile({ name: file.name, size: file.size })
      if (problem) {
        setError(`${file.name}: ${problem}`)
        return
      }
    }

    setUploading(true)
    try {
      for (const file of files) {
        const doc = await uploadDocument(file)
        setDocuments((cur) => [doc, ...cur])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    setDeletingId(id)
    const previous = documents
    setDocuments((cur) => cur.filter((d) => d.id !== id))
    try {
      await deleteDocument(id)
    } catch (err) {
      setDocuments(previous) // roll back
      setError(err instanceof Error ? err.message : "Couldn't delete that document.")
    } finally {
      setDeletingId(null)
    }
  }

  const isEmpty = documents.length === 0

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Upload resumes, cover letters, and anything else you reuse when applying.
        </p>
      </header>

      {/* Dropzone — drag a file anywhere onto it, or click to browse. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFiles(e.dataTransfer.files)
        }}
        disabled={uploading}
        aria-label="Upload documents"
        className={cn(
          "flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-70",
          dragOver
            ? "border-primary bg-accent/40"
            : "border-border bg-card hover:bg-muted/50",
        )}
      >
        <span
          className={cn(
            "grid size-11 place-items-center rounded-full",
            dragOver ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {uploading ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </span>
        <span className="mt-1 text-sm font-medium">
          {uploading ? "Uploading…" : "Drop a file here, or click to browse"}
        </span>
        <span className="text-xs text-muted-foreground">
          {ALLOWED_LABEL} · up to {MAX_MB} MB
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {isEmpty ? (
        <Card className="flex flex-col items-center gap-2 border-dashed px-6 py-16 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <FileText className="size-5" />
          </span>
          <p className="mt-1 font-medium">No documents yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload your resume or a cover letter to keep it handy across your applications.
          </p>
          <Button size="lg" className="mt-2 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" strokeWidth={2.5} />
            Upload a document
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {documents.length} {documents.length === 1 ? "document" : "documents"}
          </p>
          <ul className="flex flex-col gap-2">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                deleting={deletingId === doc.id}
                onDelete={() => void handleDelete(doc.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DocumentRow({
  doc,
  deleting,
  onDelete,
}: {
  doc: ClientDocument
  deleting: boolean
  onDelete: () => void
}) {
  const iconTone = getFileTypeIconTone(doc.fileName)

  return (
    <li>
      <Card className="flex items-center gap-3 p-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-md",
            iconTone.container,
          )}
        >
          <FileText className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium hover:underline"
            title={doc.title}
          >
            {doc.title}
          </a>
          <p className="truncate text-xs text-muted-foreground">
            {doc.fileName} · {formatBytes(doc.size)} · {formatDate(doc.createdAt)}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Download ${doc.title}`}
          render={<a href={`${doc.url}?download=1`} />}
        >
          <Download className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${doc.title}`}
          disabled={deleting}
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          {deleting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </Card>
    </li>
  )
}

function getFileTypeIconTone(fileName: string): { container: string } {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""

  // Conventional document color cues: PDF in red, Word-family documents in blue.
  if (ext === "pdf") {
    return {
      container: "bg-red-50 text-red-600 ring-1 ring-red-100",
    }
  }

  if (["doc", "docx", "docm", "dot", "dotx"].includes(ext)) {
    return {
      container: "bg-blue-50 text-blue-600 ring-1 ring-blue-100",
    }
  }

  return {
    container: "bg-muted text-muted-foreground",
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
