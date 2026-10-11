import express, { type RequestHandler } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { errorHandler } from './errorHandler.js'
import { requireAdmin, requireAuth, requireOrg } from './auth.js'

function guarded(...guards: RequestHandler[]) {
  const app = express()
  app.use(express.json())
  app.get('/private', ...guards, (req, res) => {
    res.json({ auth: req.auth })
  })
  app.use(errorHandler)
  return app
}

const asUser = JSON.stringify({ userId: 'u1', orgId: 'o1', globalRole: 'USER' })
const asOrgless = JSON.stringify({ userId: 'u1', globalRole: 'USER' })
const asAdmin = JSON.stringify({ userId: 'u2', globalRole: 'ADMIN' })

describe('requireAuth', () => {
  it('401s without credentials', async () => {
    const res = await request(guarded(requireAuth)).get('/private')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('passes with test credentials and exposes req.auth', async () => {
    const res = await request(guarded(requireAuth)).get('/private').set('x-test-auth', asUser)
    expect(res.status).toBe(200)
    expect(res.body.auth).toEqual({ userId: 'u1', orgId: 'o1', globalRole: 'USER' })
  })

  it('401s on a malformed test header rather than trusting it', async () => {
    const res = await request(guarded(requireAuth)).get('/private').set('x-test-auth', 'not-json')
    expect(res.status).toBe(401)
  })
})

describe('requireOrg', () => {
  it('403s when no organisation is active', async () => {
    const res = await request(guarded(requireAuth, requireOrg))
      .get('/private')
      .set('x-test-auth', asOrgless)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('passes when an organisation is active', async () => {
    const res = await request(guarded(requireAuth, requireOrg))
      .get('/private')
      .set('x-test-auth', asUser)
    expect(res.status).toBe(200)
  })
})

describe('requireAdmin (BR-001)', () => {
  it('403s a non-admin', async () => {
    const res = await request(guarded(requireAuth, requireAdmin))
      .get('/private')
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)
  })

  it('passes an admin', async () => {
    const res = await request(guarded(requireAuth, requireAdmin))
      .get('/private')
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
  })
})
