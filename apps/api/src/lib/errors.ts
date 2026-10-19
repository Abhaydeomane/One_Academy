import type { ErrorCode } from '@one/shared'

// R6: every failure is one of these. Only middleware/errorHandler.ts turns one
// into an HTTP response, so a service never needs to know about status codes.
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.status = status
    this.details = details
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_FAILED', 400, message, details)
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', 401, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super('FORBIDDEN', 403, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', 404, message)
  }
}

/// Carries a domain-specific code so the partner UI can explain which business
/// rule was violated rather than showing a generic conflict.
export class ConflictError extends AppError {
  constructor(code: ErrorCode = 'CONFLICT', message = 'Conflict', details?: unknown) {
    super(code, 409, message, details)
  }
}

/// A service this request depends on (Clerk) did not answer. Nothing was written.
export class UpstreamUnavailableError extends AppError {
  constructor(message = 'An upstream service is unavailable') {
    super('UPSTREAM_UNAVAILABLE', 503, message)
  }
}

export type MediaInvalidReason = 'NOT_AN_IMAGE' | 'TOO_LARGE' | 'TOO_MANY_PIXELS'

/// BR-019: an upload the image pipeline will not store. `details.reason` lets
/// the partner UI say which limit was hit.
export class MediaInvalidError extends AppError {
  constructor(reason: MediaInvalidReason, message = 'That file is not a usable image') {
    super('MEDIA_INVALID', 400, message, { reason })
  }
}
