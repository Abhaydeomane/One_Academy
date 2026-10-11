import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

declare module 'express-serve-static-core' {
  interface Request {
    id?: string
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id')
  req.id = incoming && incoming.length <= 200 ? incoming : randomUUID()
  res.setHeader('x-request-id', req.id)
  next()
}
