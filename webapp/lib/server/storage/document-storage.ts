import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"

/**
 * Storage abstraction for document file BYTES.
 *
 * Neon (our database) is Postgres — it has no object/bucket storage of its own.
 * Neon's recommended pattern is "split storage": keep the file bytes in an external
 * object store and the metadata (the `Document` row) in Postgres. The rest of the app
 * is written entirely against this interface, so turning the feature on is a one-file
 * change — implement `DocumentStorage` for a real provider and return it from
 * `documentStorage()` below.
 */
export interface PutObjectInput {
  /** Opaque key the provider uses to address the object. */
  key: string
  body: Buffer
  contentType: string
}

export interface GetObjectResult {
  body: Buffer
  contentType: string
}

export interface DocumentStorage {
  /** Stable id for the backing provider, persisted on each document (`storageProvider`). */
  readonly provider: string
  put(input: PutObjectInput): Promise<void>
  get(key: string): Promise<GetObjectResult>
  delete(key: string): Promise<void>
}

/**
 * Cloudflare R2 provider (S3-compatible). The bucket is PRIVATE: bytes are only ever read
 * back through the userId-scoped `/api/documents/:id/raw` proxy (server-side `get`), so we
 * never mint public URLs or presigned tokens that could leak access to someone else's resume.
 */
class R2Storage implements DocumentStorage {
  readonly provider = "cloudflare-r2"
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucket: string
  }) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async put({ key, body, contentType }: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
  }

  async get(key: string): Promise<GetObjectResult> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    if (!res.Body) throw ApiError.notFound("Document file not found")
    // SDK v3 stream helper → bytes. Documents are small (≤10 MB), so buffering is fine.
    const bytes = await res.Body.transformToByteArray()
    return {
      body: Buffer.from(bytes),
      contentType: res.ContentType ?? "application/octet-stream",
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback when no provider is configured.
//
// If the R2 env vars are absent, uploads use the stub below, which fails loudly with
// a clear message instead of silently dropping files. Metadata CRUD (list / delete)
// keeps working so the page and the rest of the plumbing stay exercisable.
// ─────────────────────────────────────────────────────────────────────────────

const NOT_CONFIGURED =
  "Document storage isn't set up yet. Connect a storage provider to enable uploads."

class UnconfiguredStorage implements DocumentStorage {
  readonly provider = "unconfigured"

  async put(): Promise<void> {
    throw new ApiError("INTERNAL", NOT_CONFIGURED)
  }

  async get(): Promise<GetObjectResult> {
    throw new ApiError("INTERNAL", NOT_CONFIGURED)
  }

  async delete(): Promise<void> {
    // No bytes were ever stored, so deleting a metadata row should still succeed.
  }
}

let cached: DocumentStorage | undefined

/** The active storage provider — R2 when configured, otherwise the loud stub. */
export function documentStorage(): DocumentStorage {
  if (cached) return cached

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = env
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
    cached = new R2Storage({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET_NAME,
    })
  } else {
    cached = new UnconfiguredStorage()
  }
  return cached
}
