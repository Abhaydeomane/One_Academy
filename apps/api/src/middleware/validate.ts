import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { BadRequestError } from '../lib/errors.js'

type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType }

declare module 'express-serve-static-core' {
  interface Request {
    valid?: { params?: unknown; query?: unknown; body?: unknown }
  }
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid: { params?: unknown; query?: unknown; body?: unknown } = {}

    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key]
      if (!schema) continue

      const result = schema.safeParse(req[key])
      if (!result.success) {
        throw new BadRequestError(`Invalid ${key}`, z.flattenError(result.error))
      }
      valid[key] = result.data
    }

    req.valid = valid
    next()
  }
}

// R5 safety net: a route that forgot validate() throws here instead of quietly
// reading unvalidated input.
export function validated<T>(req: Request, key: 'params' | 'query' | 'body'): T {
  const value = req.valid?.[key]
  if (value === undefined) {
    throw new Error(`R5: route read ${key} without a validate() schema`)
  }
  return value as T
}
