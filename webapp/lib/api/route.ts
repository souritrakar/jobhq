import { NextResponse, type NextRequest } from "next/server"
import { ZodError } from "zod"

import { ApiError } from "@/lib/api/errors"
import { corsHeaders } from "@/lib/api/cors"

/**
 * Shared plumbing for every route handler:
 *  - injects CORS headers (driven by the request Origin)
 *  - converts thrown ApiError / ZodError / unknown errors into a consistent
 *    `{ error: { code, message, details? } }` JSON envelope
 *
 * Handlers stay focused on the happy path: parse input, call the service layer,
 * return data via the `ok()` helpers below.
 */
type RouteHandler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
) => Promise<Response> | Response

export function withRoute<Ctx>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const cors = corsHeaders(req.headers.get("origin"))
    try {
      const res = await handler(req, ctx)
      applyHeaders(res, cors)
      return res
    } catch (err) {
      const res = errorResponse(err)
      applyHeaders(res, cors)
      return res
    }
  }
}

/** Handle a CORS preflight (`OPTIONS`) request. Export as `OPTIONS` from a route. */
export function preflight(req: NextRequest): Response {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  })
}

/** 200 with `{ data }`. */
export function ok<T>(data: T): NextResponse {
  return NextResponse.json({ data })
}

/** 201 with `{ data }`. */
export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 })
}

function applyHeaders(res: Response, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    )
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Validation failed",
          details: err.flatten(),
        },
      },
      { status: 400 },
    )
  }
  // Unexpected: log the real error server-side, return an opaque 500.
  console.error("[api] unhandled error:", err)
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  )
}
