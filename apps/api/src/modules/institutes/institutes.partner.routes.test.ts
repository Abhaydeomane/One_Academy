import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@one/db'
import {
  partnerListingDetail,
  partnerListingListResponse,
  partnerReferenceResponse,
} from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'
import { fetchClerkOrganization } from '../../lib/clerk.js'

vi.mock('../../lib/clerk.js', () => ({ fetchClerkOrganization: vi.fn() }))
const fetchOrg = vi.mocked(fetchClerkOrganization)

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  fetchOrg.mockReset()
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

  it('provisions an organisation it has not seen and returns its empty list', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_unknown', name: 'Gamma Classes', slug: 'gamma-classes' })

    const res = await testApp()
      .get('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_unknown'))

    expect(res.status).toBe(200)
    expect(partnerListingListResponse.parse(res.body).items).toHaveLength(0)
    expect(await prisma.organization.count({ where: { clerkOrgId: 'co_unknown' } })).toBe(1)
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

describe('GET /api/v1/partner/reference', () => {
  it('lists cities and exam tags', async () => {
    const res = await testApp()
      .get('/api/v1/partner/reference')
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)
    const body = partnerReferenceResponse.parse(res.body)
    expect(body.cities).toEqual([{ slug: 'pune', name: 'Pune', state: 'Maharashtra' }])
    expect(body.exams).toEqual([{ slug: 'jee', label: 'JEE' }])
  })
})

describe('POST /api/v1/partner/listings (BR-011)', () => {
  it('creates a DRAFT for the session organisation, ignoring status and organizationId', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({
        name: 'Gamma Classes',
        citySlug: 'pune',
        status: 'PUBLISHED',
        organizationId: seed.otherOrgId,
      })

    expect(res.status).toBe(201)
    const body = partnerListingDetail.parse(res.body)
    expect(body.status).toBe('DRAFT')
    expect(body.slug).toBe('gamma-classes-pune')

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: body.id } })
    expect(row.organizationId).toBe(seed.orgId)
  })

  it('suffixes the slug when the same name is taken in the same city', async () => {
    const first = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Gamma Classes', citySlug: 'pune' })
    const second = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_beta'))
      .send({ name: 'Gamma Classes', citySlug: 'pune' })

    expect(first.body.slug).toBe('gamma-classes-pune')
    expect(second.status).toBe(201)
    expect(second.body.slug).toBe('gamma-classes-pune-2')
  })

  it('avoids a slug held by a redirect', async () => {
    await prisma.listingRedirect.create({
      data: { listingId: seed.publishedListingId, oldSlug: 'gamma-classes-pune' },
    })
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Gamma Classes', citySlug: 'pune' })
    expect(res.body.slug).toBe('gamma-classes-pune-2')
  })

  it('builds a slug from the city alone for a non-Latin name', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'ज्ञान अकादमी', citySlug: 'pune' })
    expect(res.status).toBe(201)
    expect(res.body.slug).toBe('pune')
  })

  it('400s an unknown city', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Gamma Classes', citySlug: 'atlantis' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('400s a one-character name', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: ' G ', citySlug: 'pune' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/v1/partner/listings/:listingId — verification details', () => {
  it('stores address, phone and exams and returns them to the owner', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ address: '9 MG Road, Pune 411001', contactPhone: '9876543210', examSlugs: ['jee'] })

    expect(res.status).toBe(200)
    const body = partnerListingDetail.parse(res.body)
    expect(body).toMatchObject({
      address: '9 MG Road, Pune 411001',
      contactPhone: '9876543210',
      exams: ['jee'],
    })
  })

  it('400s an unknown exam and changes nothing', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ examSlugs: ['jee', 'astrology'] })
    expect(res.status).toBe(400)
    const tags = await prisma.listingTag.findMany({
      where: { listingId: seed.draftListingId },
      select: { tag: { select: { slug: true } } },
    })
    expect(tags.map((entry) => entry.tag.slug)).toEqual(['jee'])
  })

  it('writes nothing when a city move is followed by an invalid exam', async () => {
    await prisma.city.create({ data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' } })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ citySlug: 'mumbai', examSlugs: ['astrology'] })
    expect(res.status).toBe(400)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.slug).toBe('draft-academy')
    expect(row.cityId).toBe(seed.cityId)
  })

  it('400s a malformed phone', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ contactPhone: '+91 98765 43210' })
    expect(res.status).toBe(400)
  })

  it('moves a draft to another city and regenerates its slug', async () => {
    await prisma.city.create({ data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' } })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ citySlug: 'mumbai' })

    const body = partnerListingDetail.parse(res.body)
    expect(body.citySlug).toBe('mumbai')
    expect(body.slug).toBe('draft-academy-mumbai')
  })

  it('regenerates the slug when a draft is renamed', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Alpha Prime' })
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).slug).toBe('alpha-prime-pune')
  })

  it('keeps the slug when a published listing is renamed (BR-002)', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Alpha Prime' })
    expect(res.status).toBe(200)
    const body = partnerListingDetail.parse(res.body)
    expect(body.name).toBe('Alpha Prime')
    expect(body.slug).toBe(seed.publishedSlug)
  })

  it('leaves amenity tags untouched when exams are replaced', async () => {
    const amenity = await prisma.tag.create({
      data: { slug: 'wifi', label: 'Wi-Fi', kind: 'AMENITY' },
    })
    await prisma.listingTag.create({
      data: { listingId: seed.draftListingId, tagId: amenity.id },
    })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ examSlugs: ['jee'] })
    expect(res.status).toBe(200)
    const tags = await prisma.listingTag.findMany({
      where: { listingId: seed.draftListingId },
      select: { tag: { select: { slug: true } } },
    })
    expect(tags.map((entry) => entry.tag.slug).sort()).toEqual(['jee', 'wifi'])
  })

  it('409s CITY_IMMUTABLE on a published listing', async () => {
    await prisma.city.create({ data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' } })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ citySlug: 'mumbai' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CITY_IMMUTABLE')
  })
})

describe('BR-002 amended: freezes follow firstPublishedAt, not status', () => {
  it('keeps the slug when a suspended listing is renamed', async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Alpha Academy Renamed' })
    expect(res.status).toBe(200)
    const body = partnerListingDetail.parse(res.body)
    expect(body.name).toBe('Alpha Academy Renamed')
    expect(body.slug).toBe('alpha-academy')
  })

  it('keeps the slug when a once-published listing back in DRAFT is renamed', async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'DRAFT' },
    })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Alpha Academy Renamed' })
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).slug).toBe('alpha-academy')
  })

  it('refuses a city change on a suspended listing', async () => {
    await prisma.city.create({ data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' } })
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ citySlug: 'mumbai' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CITY_IMMUTABLE')
  })
})

describe('POST /api/v1/partner/listings/:listingId/submit (BR-012)', () => {
  it.each([
    ['address', { address: null }],
    ['contactPhone', { contactPhone: null }],
  ] as const)('409s LISTING_INCOMPLETE naming %s', async (field, data) => {
    await prisma.listing.update({ where: { id: seed.draftListingId }, data })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LISTING_INCOMPLETE')
    expect(res.body.error.details.missing).toEqual([field])
  })

  it('409s naming exams when none are set', async () => {
    await prisma.listingTag.deleteMany({ where: { listingId: seed.draftListingId } })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.body.error.details.missing).toEqual(['exams'])
  })

  it('submits a complete listing, stamps submittedAt and clears the rejection reason', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { rejectionReason: 'Phone did not answer' },
    })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))

    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body)).toMatchObject({
      status: 'PENDING_REVIEW',
      rejectionReason: null,
    })
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.submittedAt).not.toBeNull()
  })
})

describe('Resubmission, withdrawal and the review lock (BR-016, BR-017)', () => {
  const suspendPublished = (data: Record<string, unknown> = {}) =>
    prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: {
        status: 'SUSPENDED',
        suspensionReason: 'Address could not be verified',
        address: '12 FC Road, Pune 411004',
        contactPhone: '9000000001',
        ...data,
      },
    })
  const post = (id: string, action: string, org = 'co_alpha') =>
    testApp().post(`/api/v1/partner/listings/${id}/${action}`).set('x-test-auth', auth(org))

  it('resubmits a suspended listing into review', async () => {
    await suspendPublished()
    const res = await post(seed.publishedListingId, 'submit')
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body)).toMatchObject({
      status: 'PENDING_REVIEW',
      suspensionReason: 'Address could not be verified',
    })
  })

  it('applies BR-012 to a suspended listing', async () => {
    await suspendPublished({ address: null })
    const res = await post(seed.publishedListingId, 'submit')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LISTING_INCOMPLETE')
    expect(res.body.error.details.missing).toEqual(['address'])
  })

  it('409s LISTING_UNDER_REVIEW for an edit while in review', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ shortDescription: 'Changed during review' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LISTING_UNDER_REVIEW')
    const after = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(after.shortDescription).toBe(before.shortDescription)
  })

  it('still allows batch creation while in review', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/batches`)
      .set('x-test-auth', auth('co_alpha'))
      .send({
        title: 'JEE 2028',
        exam: 'JEE',
        mode: 'OFFLINE',
        startDate: '2028-04-01',
        seatsTotal: 30,
        feeAmount: 10_000_000,
        feeCurrency: 'INR',
      })
    expect(res.status).toBe(201)
  })

  it('withdraws a never-published listing to DRAFT', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await post(seed.draftListingId, 'withdraw')
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).status).toBe('DRAFT')
  })

  it('withdraws a once-published listing to SUSPENDED', async () => {
    await suspendPublished({ status: 'PENDING_REVIEW' })
    const res = await post(seed.publishedListingId, 'withdraw')
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).status).toBe('SUSPENDED')
  })

  it('409s a withdraw outside review', async () => {
    const res = await post(seed.draftListingId, 'withdraw')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it("403s a withdraw of another organisation's listing", async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await post(seed.draftListingId, 'withdraw', 'co_beta')
    expect(res.status).toBe(403)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.status).toBe('PENDING_REVIEW')
  })
})

describe('BR-018: edits to a published listing are flagged for review', () => {
  const patch = (id: string, body: Record<string, unknown>) =>
    testApp()
      .patch(`/api/v1/partner/listings/${id}`)
      .set('x-test-auth', auth('co_alpha'))
      .send(body)
  const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } })

  it('does not flag an edit that changes nothing watched', async () => {
    expect(
      (await patch(seed.publishedListingId, { shortDescription: 'JEE coaching' })).status,
    ).toBe(200)
    expect((await row(seed.publishedListingId)).changedSinceReviewAt).toBeNull()
  })

  it('flags a watched edit on a published listing and baselines a missing snapshot', async () => {
    expect((await patch(seed.publishedListingId, { about: 'New about text' })).status).toBe(200)
    const after = await row(seed.publishedListingId)
    expect(after.changedSinceReviewAt).toBeInstanceOf(Date)
    expect((after.reviewedSnapshot as Record<string, unknown>).about).toBeNull()
  })

  it('clears the flag when an edit restores the snapshot', async () => {
    await patch(seed.publishedListingId, { locality: 'Baner' })
    await patch(seed.publishedListingId, { locality: 'Kothrud' })
    expect((await row(seed.publishedListingId)).changedSinceReviewAt).toBeNull()
  })

  it('keeps the change token when a flagged listing is re-saved without a watched change', async () => {
    await patch(seed.publishedListingId, { about: 'New about text' })
    const flagged = (await row(seed.publishedListingId)).changedSinceReviewAt
    expect(flagged).toBeInstanceOf(Date)
    await new Promise((resolve) => setTimeout(resolve, 5))

    // The verification form re-sends every field on Save, changed or not.
    await patch(seed.publishedListingId, {
      about: 'New about text',
      shortDescription: 'JEE coaching',
    })
    expect((await row(seed.publishedListingId)).changedSinceReviewAt).toEqual(flagged)
  })

  it('moves the change token when a flagged listing gets another watched change', async () => {
    await patch(seed.publishedListingId, { about: 'New about text' })
    const flagged = (await row(seed.publishedListingId)).changedSinceReviewAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    await patch(seed.publishedListingId, { locality: 'Baner' })
    const moved = (await row(seed.publishedListingId)).changedSinceReviewAt
    expect(moved!.getTime()).toBeGreaterThan(flagged!.getTime())
  })

  it('does not flag a draft that was never published', async () => {
    await patch(seed.draftListingId, { about: 'New about text' })
    const after = await row(seed.draftListingId)
    expect(after.changedSinceReviewAt).toBeNull()
    expect(after.reviewedSnapshot).toBeNull()
  })
})
