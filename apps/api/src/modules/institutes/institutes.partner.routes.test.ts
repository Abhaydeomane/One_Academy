import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { partnerListingDetail, partnerListingListResponse } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
  // The partner API receives Clerk organisation ids, so the mirror rows need
  // them populated.
  await prisma.organization.update({
    where: { id: seed.orgId },
    data: { clerkOrgId: 'co_alpha' },
  })
  await prisma.organization.update({
    where: { id: seed.otherOrgId },
    data: { clerkOrgId: 'co_beta' },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

const auth = (orgId: string) => JSON.stringify({ userId: 'u1', orgId, globalRole: 'USER' })

describe('GET /api/v1/partner/listings', () => {
  it('401s without authentication', async () => {
    const res = await testApp().get('/api/v1/partner/listings')
    expect(res.status).toBe(401)
  })

  it('403s when no organisation is active', async () => {
    const res = await testApp()
      .get('/api/v1/partner/listings')
      .set('x-test-auth', JSON.stringify({ userId: 'u1', globalRole: 'USER' }))
    expect(res.status).toBe(403)
  })

  it('returns both draft and published listings for the active organisation', async () => {
    const res = await testApp().get('/api/v1/partner/listings').set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)

    const body = partnerListingListResponse.parse(res.body)
    expect(body.items).toHaveLength(2)
    expect(body.items.map((item) => item.status).sort()).toEqual(['DRAFT', 'PUBLISHED'])
  })

  it('returns nothing for an organisation that owns no listings', async () => {
    const res = await testApp().get('/api/v1/partner/listings').set('x-test-auth', auth('co_beta'))
    expect(partnerListingListResponse.parse(res.body).items).toHaveLength(0)
  })

  it('403s an organisation that is not provisioned locally', async () => {
    const res = await testApp()
      .get('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_unknown'))
    expect(res.status).toBe(403)
  })
})

describe('GET /api/v1/partner/listings/:listingId', () => {
  it('returns the listing with all batches, including drafts', async () => {
    const res = await testApp()
      .get(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)

    const body = partnerListingDetail.parse(res.body)
    expect(body.batches).toHaveLength(2)
  })

  it('403s another organisation', async () => {
    const res = await testApp()
      .get(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_beta'))
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/v1/partner/listings/:listingId', () => {
  it('updates the description', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ shortDescription: 'Updated copy' })
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).shortDescription).toBe('Updated copy')
  })

  it('400s an empty patch body', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({})
    expect(res.status).toBe(400)
  })

  it('403s another organisation', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_beta'))
      .send({ shortDescription: 'Hijack' })
    expect(res.status).toBe(403)

    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.publishedListingId },
    })
    expect(listing.shortDescription).toBe('JEE coaching')
  })
})

describe('POST /api/v1/partner/listings/:listingId/batches', () => {
  it('creates a batch', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/batches`)
      .set('x-test-auth', auth('co_alpha'))
      .send({
        title: 'NEET 2028',
        exam: 'NEET',
        mode: 'ONLINE',
        startDate: '2028-01-10',
        seatsTotal: 25,
        feeAmount: 750000,
      })
    expect(res.status).toBe(201)
    expect(await prisma.batch.count({ where: { listingId: seed.draftListingId } })).toBe(1)
  })

  it('400s a non-integer fee (BR-005)', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/batches`)
      .set('x-test-auth', auth('co_alpha'))
      .send({
        title: 'Bad fee',
        exam: 'NEET',
        mode: 'ONLINE',
        startDate: '2028-01-10',
        seatsTotal: 25,
        feeAmount: 7500.5,
      })
    expect(res.status).toBe(400)
    expect(await prisma.batch.count({ where: { listingId: seed.draftListingId } })).toBe(0)
  })
})

describe('POST /api/v1/partner/listings/:listingId/submit', () => {
  it('moves a draft to PENDING_REVIEW', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).status).toBe('PENDING_REVIEW')
  })

  it('409s an already published listing', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.publishedListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it("403s submitting another organisation's listing", async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_beta'))
    expect(res.status).toBe(403)

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('DRAFT')
  })
})

describe('PATCH /api/v1/partner/batches/:batchId', () => {
  it('publishes a draft batch on a published listing', async () => {
    const created = await prisma.batch.create({
      data: {
        listingId: seed.publishedListingId,
        title: 'Future batch',
        exam: 'JEE',
        startDate: new Date('2028-02-01T00:00:00Z'),
        seatsTotal: 20,
        seatsAvailable: 20,
        feeAmount: 100000,
        status: 'DRAFT',
      },
    })

    const res = await testApp()
      .patch(`/api/v1/partner/batches/${created.id}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ status: 'PUBLISHED' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PUBLISHED')
  })

  it('409s publishing a batch whose listing is unpublished (BR-004)', async () => {
    const created = await prisma.batch.create({
      data: {
        listingId: seed.draftListingId,
        title: 'Blocked batch',
        exam: 'JEE',
        startDate: new Date('2028-02-01T00:00:00Z'),
        seatsTotal: 20,
        seatsAvailable: 20,
        feeAmount: 100000,
        status: 'DRAFT',
      },
    })

    const res = await testApp()
      .patch(`/api/v1/partner/batches/${created.id}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ status: 'PUBLISHED' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BATCH_PARENT_NOT_PUBLISHED')
  })
})
