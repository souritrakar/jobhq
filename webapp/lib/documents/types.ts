/**
 * The document shape the web app renders and the browser helpers speak. This is the
 * serialized form of a `Document` Prisma row — dates become ISO strings and a ready-to-use
 * `url` is attached so any part of the app can fetch the file without knowing storage details.
 */
export type ClientDocument = {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  /** ISO timestamp. */
  createdAt: string
  /** Same-origin URL that streams the file bytes (GET). Other features can fetch this. */
  url: string
}
