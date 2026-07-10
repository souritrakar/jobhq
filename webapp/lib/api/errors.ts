/**
 * Application-level error with an HTTP status and a stable, machine-readable code.
 *
 * Throw these from the service layer (lib/server/*) and route handlers. The
 * `withRoute` wrapper (lib/api/route.ts) turns them into a consistent JSON error
 * response, so handlers never have to build error responses by hand.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL"

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError("BAD_REQUEST", message, details)
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError("UNAUTHORIZED", message)
  }
  static notFound(message = "Resource not found") {
    return new ApiError("NOT_FOUND", message)
  }
}
