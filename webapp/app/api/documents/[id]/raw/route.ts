import { NextResponse, type NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { preflight, withRoute } from "@/lib/api/route"
import { getDocumentContent } from "@/lib/server/documents"

type Ctx = { params: Promise<{ id: string }> }

/**
 * The only MIME types we'll serve `inline` (rendered in the browser tab). Everything else is sent
 * as an attachment with an inert type, so a document that carries — or was uploaded with — an
 * active Content-Type (`text/html`, `image/svg+xml`, …) can never execute script in our origin.
 * PDFs are the sole format the UI previews inline; Word/RTF/ODT download in every browser anyway.
 */
const INLINE_SAFE_TYPES = new Set(["application/pdf"])

/**
 * GET /api/documents/:id/raw — stream a document's bytes.
 *
 * This is the seam other features use to READ a document (e.g. an AI step reading the user's
 * resume): fetch this URL and you get the file. By default the bytes are served inline; add
 * `?download=1` to force a save dialog. Unlike the JSON endpoints this returns the raw body,
 * not a `{ data }` envelope — `withRoute` still applies CORS and turns errors into the
 * standard error JSON.
 */
export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = getUserId(req)
  const { id } = await params
  const { body, contentType, fileName } = await getDocumentContent(userId, id)

  // Only preview a small allowlist of safe types in-tab; force-download everything else (and
  // anything the caller explicitly asked to download) under an inert type. This is what keeps a
  // crafted document from running as HTML/SVG on our own origin.
  const download = req.nextUrl.searchParams.get("download") === "1"
  const inline = !download && INLINE_SAFE_TYPES.has(contentType)
  const disposition = inline ? "inline" : "attachment"
  const responseType = inline ? contentType : "application/octet-stream"
  // Encode the filename so non-ASCII / quotes can't break the header.
  const encoded = encodeURIComponent(fileName)

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": responseType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
      // Defense in depth: never let the browser sniff a different type, and sandbox the response
      // so even a document that slips through as HTML can't run script or reach our origin.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      // Private file — don't let shared caches hold it.
      "Cache-Control": "private, no-store",
    },
  })
})

export const OPTIONS = preflight
