import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { adminListingQueueResponse, adminListingSummary } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const asAdmin = JSON.stringify({ userId: 'u-admin', globalRole: 'ADMIN' })
const asUser = JSON.stringify({ userId: 'u-user', orgId: 'co_alpha', globalRole: 'USER' })

describe('GET /api/v1/admin/listings (BR-001)', () => {
  it('401s anonymously', async () => {
    expect((await testApp().get('/api/v1/admin/listings')).status).toBe(401)
  })

  it('403s a non-admin', async () => {
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asUser)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('defaults to the PENDING_REVIEW queue', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })

    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)

    const body = adminListingQueueResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.id).toBe(seed.draftListingId)
    expect(body.items[0]?.organizationName).toBe('Alpha')
  })

  it('filters by an explicit status', async () => {
    const res = await testApp()
      .get('/api/v1/admin/listings?status=PUBLISHED')
      .set('x-test-auth', asAdmin)

    const body = adminListingQueueResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.id).toBe(seed.publishedListingId)
  })

  it('rejects an unknown status', async () => {
    const res = await testApp()
      .get('/api/v1/admin/listings?status=NOPE')
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/admin/listings/:listingId/publish (BR-001)', () => {
  it('403s a non-admin and leaves the listing untouched', async () => {
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('DRAFT')
  })

  it('publishes a pending listing and stamps publishedAt', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })

    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    expect(adminListingSummary.parse(res.body).status).toBe('PUBLISHED')

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.publishedAt).toBeInstanceOf(Date)
  })

  it('409s an already published listing', async () => {
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('404s an unknown listing', async () => {
    const res = await testApp()
      .post('/api/v1/admin/listings/missing/publish')
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(404)
  })

  it('makes the newly published listing visible on the public endpoint', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })

    expect((await testApp().get(`/api/v1/institutes/${seed.draftSlug}`)).status).toBe(404)

    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)

    expect((await testApp().get(`/api/v1/institutes/${seed.draftSlug}`)).status).toBe(200)
  })
})
