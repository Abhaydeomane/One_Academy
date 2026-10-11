import { getAuth } from '@clerk/express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { config } from '../config/index.js'
import { ForbiddenError, UnauthenticatedError } from '../lib/errors.js'

export type AuthContext = {
  userId: string
  /// Clerk organisation id, not the local Organization.id. Translate with
  /// accounts.service.resolveLocalOrgId before any database query.
  orgId?: string
  globalRole: 'USER' | 'ADMIN'
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext
  }
}

const testAuthSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1).optional(),
  globalRole: z.enum(['USER', 'ADMIN']).default('USER'),
})

// The one deliberate test seam in the API. Integration tests must exercise the
// real authorization logic without depending on live Clerk sessions, so this
// header is honoured ONLY when NODE_ENV=test.
function readTestAuth(req: Request): AuthContext | null {
  if (!config.isTest) return null

  const header = req.get('x-test-auth')
  if (!header) return null

  try {
    const parsed = testAuthSchema.safeParse(JSON.parse(header))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const testAuth = readTestAuth(req)
  if (testAuth) {
    req.auth = testAuth
    next()
    return
  }

  let clerk: ReturnType<typeof getAuth>
  try {
    clerk = getAuth(req)
  } catch {
    // clerkMiddleware() is not mounted, which means Clerk is unconfigured.
    throw new UnauthenticatedError()
  }

  if (!clerk?.userId) throw new UnauthenticatedError()

  const metadata = clerk.sessionClaims?.metadata as { globalRole?: string } | undefined

  req.auth = {
    userId: clerk.userId,
    ...(clerk.orgId ? { orgId: clerk.orgId } : {}),
    globalRole: metadata?.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
  }
  next()
}

export function requireOrg(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw new UnauthenticatedError()
  if (!req.auth.orgId) throw new ForbiddenError('No active organisation')
  next()
}

/// BR-001: publishing is admin-only.
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw new UnauthenticatedError()
  if (req.auth.globalRole !== 'ADMIN') throw new ForbiddenError('Admin role required')
  next()
}

export function currentAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthenticatedError()
  return req.auth
}

export function currentOrgId(req: Request): string {
  const auth = currentAuth(req)
  if (!auth.orgId) throw new ForbiddenError('No active organisation')
  return auth.orgId
}
