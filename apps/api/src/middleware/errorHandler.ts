import type { NextFunction, Request, Response } from 'express'
import type { ErrorEnvelope } from '@one/shared'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

// The only place in the API that maps an error to an HTTP status. The R6 lint
// rule exempts this file alone.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    const body: ErrorEnvelope = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    }
    logger.warn({ requestId: req.id, code: error.code, path: req.path }, error.message)
    res.status(error.status).json(body)
    return
  }

  // Unknown failures are logged in full but never described to the client; the
  // message could carry a connection string or query text.
  logger.error({ requestId: req.id, path: req.path, err: error }, 'Unhandled error')
  const body: ErrorEnvelope = { error: { code: 'INTERNAL', message: 'Internal server error' } }
  res.status(500).json(body)
}
