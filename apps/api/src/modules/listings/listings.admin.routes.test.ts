import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { adminListingDetail, adminListingQueueResponse, adminListingSummary } from '@one/shared'
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

const asAdmin2 = JSON.stringify({ userId: 'u-admin-2', globalRole: 'ADMIN' })

async function makePending(listingId: string) {
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'PENDING_REVIEW', submittedAt: new Date() },
  })
}

describe('queue fields', () => {
  it('flags a listing whose organisation is unverified as a new institute', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    const item = adminListingQueueResponse.parse(res.body).items[0]
    expect(item).toMatchObject({ newInstitute: true, contactPhone: '9000000001' })
    expect(item?.submittedAt).not.toBeNull()
  })

  it('does not flag a verified organisation', async () => {
    await prisma.organization.update({
      where: { id: seed.orgId },
      data: { verifiedAt: new Date() },
    })
    await makePending(seed.draftListingId)
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    expect(adminListingQueueResponse.parse(res.body).items[0]?.newInstitute).toBe(false)
  })
})

describe('GET /api/v1/admin/listings/:listingId', () => {
  it('returns everything the review screen needs', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .get(`/api/v1/admin/listings/${seed.draftListingId}`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    expect(adminListingDetail.parse(res.body)).toMatchObject({
      address: '1 Test Road, Pune 411001',
      exams: ['jee'],
      modes: ['ONLINE'],
      batchCount: 0,
    })
  })

  it('403s a non-admin', async () => {
    const res = await testApp()
      .get(`/api/v1/admin/listings/${seed.draftListingId}`)
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)
  })
})

describe('publish verifies the organisation (BR-013)', () => {
  it('sets verifiedAt and the verifying admin on first publish', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    expect(org.verifiedAt).not.toBeNull()
    expect(org.verifiedByClerkUserId).toBe('u-admin')
  })

  it('never overwrites an existing verification', async () => {
    const original = new Date('2026-02-01T00:00:00Z')
    await prisma.organization.update({
      where: { id: seed.orgId },
      data: { verifiedAt: original, verifiedByClerkUserId: 'u-admin' },
    })
    await makePending(seed.draftListingId)
    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin2)

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    expect(org.verifiedAt).toEqual(original)
    expect(org.verifiedByClerkUserId).toBe('u-admin')
  })

  it('409s a second publish of the same listing', async () => {
    await makePending(seed.draftListingId)
    const path = `/api/v1/admin/listings/${seed.draftListingId}/publish`
    await testApp().post(path).set('x-test-auth', asAdmin)
    const again = await testApp().post(path).set('x-test-auth', asAdmin)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })
})

describe('POST /api/v1/admin/listings/:listingId/reject (BR-014)', () => {
  const path = () => `/api/v1/admin/listings/${seed.draftListingId}/reject`

  it('returns the listing to DRAFT with the reason', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asAdmin)
      .send({ reason: 'The phone number did not answer.' })

    expect(res.status).toBe(200)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.status).toBe('DRAFT')
    expect(row.rejectionReason).toBe('The phone number did not answer.')
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    expect(org.verifiedAt).toBeNull()
  })

  it('400s a reason that is too short after trimming', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asAdmin)
      .send({ reason: '   no   ' })
    expect(res.status).toBe(400)
  })

  it('409s a listing that is not waiting for review', async () => {
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asAdmin)
      .send({ reason: 'The phone number did not answer.' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('403s a non-admin', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asUser)
      .send({ reason: 'The phone number did not answer.' })
    expect(res.status).toBe(403)
  })
})

describe('concurrent and repeated decisions', () => {
  const base = () => `/api/v1/admin/listings/${seed.draftListingId}`
  const reason = { reason: 'The phone number did not answer.' }

  it('409s a reject after publish and leaves the listing PUBLISHED', async () => {
    await makePending(seed.draftListingId)
    await testApp().post(`${base()}/publish`).set('x-test-auth', asAdmin)
    const res = await testApp().post(`${base()}/reject`).set('x-test-auth', asAdmin).send(reason)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.status).toBe('PUBLISHED')
  })

  it('lets exactly one of a simultaneous publish and reject win', async () => {
    await makePending(seed.draftListingId)
    const [pub, rej] = await Promise.all([
      testApp().post(`${base()}/publish`).set('x-test-auth', asAdmin),
      testApp().post(`${base()}/reject`).set('x-test-auth', asAdmin2).send(reason),
    ])
    expect([pub.status, rej.status].sort()).toEqual([200, 409])

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    if (row.status === 'PUBLISHED') {
      expect(row.rejectionReason).toBeNull()
      expect(org.verifiedAt).not.toBeNull()
    } else {
      expect(row.status).toBe('DRAFT')
      expect(org.verifiedAt).toBeNull()
    }
  })

  it('409s publishing a DRAFT listing', async () => {
    const res = await testApp().post(`${base()}/publish`).set('x-test-auth', asAdmin)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('clears a previous rejection reason on publish', async () => {
    await makePending(seed.draftListingId)
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { rejectionReason: 'An older reason for rejection' },
    })
    await testApp().post(`${base()}/publish`).set('x-test-auth', asAdmin)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.rejectionReason).toBeNull()
  })
})

describe('queue ordering', () => {
  it('lists the oldest submission first', async () => {
    const day = 24 * 60 * 60 * 1000
    const source = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    const newer = await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        organizationId: source.organizationId,
        cityId: source.cityId,
        name: 'Newer Institute',
        slug: 'newer-institute',
        status: 'PENDING_REVIEW',
        submittedAt: new Date(),
      },
    })
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW', submittedAt: new Date(Date.now() - 2 * day) },
    })
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    const items = adminListingQueueResponse.parse(res.body).items
    expect(items.map((i) => i.id)).toEqual([seed.draftListingId, newer.id])
  })
})
