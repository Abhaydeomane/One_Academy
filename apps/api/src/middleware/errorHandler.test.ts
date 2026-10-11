import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { errorEnvelope } from '@one/shared'
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js'
import { errorHandler } from './errorHandler.js'
import { requestId } from './requestId.js'

function appThatThrows(error: unknown) {
  const app = express()
  app.use(requestId)
  app.get('/boom', () => {
    throw error
  })
  app.get('/async-boom', async () => {
    await Promise.resolve()
    throw error
  })
  app.use(errorHandler)
  return app
}

describe('errorHandler', () => {
  it('maps NotFoundError to 404 with the uniform envelope', async () => {
    const res = await request(appThatThrows(new NotFoundError('Listing not found'))).get('/boom')
    expect(res.status).toBe(404)
    expect(errorEnvelope.parse(res.body).error.code).toBe('NOT_FOUND')
  })

  it('maps ForbiddenError to 403', async () => {
    const res = await request(appThatThrows(new ForbiddenError())).get('/boom')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('maps ConflictError with its domain code', async () => {
    const res = await request(
      appThatThrows(new ConflictError('SLUG_IMMUTABLE', 'Slug cannot change')),
    ).get('/boom')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLUG_IMMUTABLE')
  })

  it('maps an unknown error to 500 INTERNAL without leaking its message', async () => {
    const res = await request(appThatThrows(new Error('secret db connection string'))).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(res.body)).not.toContain('secret db connection string')
  })

  it('catches rejections from async handlers with no asyncHandler wrapper (Express 5)', async () => {
    const res = await request(appThatThrows(new NotFoundError())).get('/async-boom')
    expect(res.status).toBe(404)
  })

  it('sets a request id header on the response', async () => {
    const res = await request(appThatThrows(new NotFoundError())).get('/boom')
    expect(res.headers['x-request-id']).toBeTruthy()
  })
})
