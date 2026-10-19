import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import {
  adminDecisionResponse,
  adminListingDetail,
  adminListingQueueResponse,
  adminListingSummary,
} from '@one/shared'
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

  it('sets firstPublishedAt on first publish and never moves it', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    const first = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(first.firstPublishedAt).toEqual(first.publishedAt)

    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW', publishedAt: new Date('2020-01-01T00:00:00Z') },
    })
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    const second = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(second.publishedAt?.getTime()).toBeGreaterThan(Date.parse('2020-01-02T00:00:00Z'))
    expect(second.firstPublishedAt).toEqual(first.firstPublishedAt)
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

const suspend = (id: string, reason = 'Fraudulent institute reported by students') =>
  testApp()
    .post(`/api/v1/admin/listings/${id}/suspend`)
    .set('x-test-auth', asAdmin)
    .send({ reason })

const reinstate = (id: string) =>
  testApp().post(`/api/v1/admin/listings/${id}/reinstate`).set('x-test-auth', asAdmin)

describe('POST /api/v1/admin/listings/:listingId/suspend (BR-015)', () => {
  it('403s a non-admin and leaves the listing PUBLISHED', async () => {
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/suspend`)
      .set('x-test-auth', asUser)
      .send({ reason: 'Fraudulent institute reported by students' })
    expect(res.status).toBe(403)
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.publishedListingId },
    })
    expect(listing.status).toBe('PUBLISHED')
  })

  it('suspends a published listing with the reason, time and admin', async () => {
    const res = await suspend(seed.publishedListingId, '  Fraudulent institute reported  ')
    expect(res.status).toBe(200)
    expect(adminListingSummary.parse(res.body).suspensionReason).toBe(
      'Fraudulent institute reported',
    )
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.publishedListingId },
    })
    expect(listing.status).toBe('SUSPENDED')
    expect(listing.suspensionReason).toBe('Fraudulent institute reported')
    expect(listing.suspendedAt).toBeInstanceOf(Date)
    expect(listing.suspendedByClerkUserId).toBe('u-admin')
  })

  it('400s a reason shorter than 10 characters after trimming', async () => {
    const res = await suspend(seed.publishedListingId, '   short   ')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it.each(['DRAFT', 'PENDING_REVIEW', 'SUSPENDED'] as const)('409s from %s', async (status) => {
    await prisma.listing.update({ where: { id: seed.publishedListingId }, data: { status } })
    const res = await suspend(seed.publishedListingId)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('lets exactly one of two concurrent suspends win', async () => {
    const results = await Promise.all([
      suspend(seed.publishedListingId),
      suspend(seed.publishedListingId),
    ])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  })

  it('404s an unknown listing', async () => {
    expect((await suspend('nope')).status).toBe(404)
  })
})

describe('POST /api/v1/admin/listings/:listingId/reinstate (BR-016)', () => {
  it('returns a suspended listing to PUBLISHED and clears the suspension', async () => {
    await suspend(seed.publishedListingId)
    const res = await reinstate(seed.publishedListingId)
    expect(res.status).toBe(200)
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.publishedListingId },
    })
    expect(listing.status).toBe('PUBLISHED')
    expect(listing.suspensionReason).toBeNull()
    expect(listing.suspendedAt).toBeNull()
    expect(listing.suspendedByClerkUserId).toBeNull()
  })

  it('409s a listing that is not suspended', async () => {
    const res = await reinstate(seed.publishedListingId)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('403s a non-admin', async () => {
    await suspend(seed.publishedListingId)
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/reinstate`)
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)
  })

  it('lets exactly one of two concurrent reinstates win', async () => {
    await suspend(seed.publishedListingId)
    const results = await Promise.all([
      reinstate(seed.publishedListingId),
      reinstate(seed.publishedListingId),
    ])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  })
})

describe('Resubmissions after suspension (BR-016)', () => {
  const resubmitted = () =>
    prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'PENDING_REVIEW', suspensionReason: 'Address could not be verified' },
    })
  const reason = { reason: 'The new address still does not match.' }

  it('rejecting a resubmission returns it to SUSPENDED', async () => {
    await resubmitted()
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/reject`)
      .set('x-test-auth', asAdmin)
      .send(reason)
    expect(res.status).toBe(200)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.publishedListingId } })
    expect(row.status).toBe('SUSPENDED')
    expect(row.rejectionReason).toBe(reason.reason)
  })

  it('rejecting a first submission still returns it to DRAFT', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/reject`)
      .set('x-test-auth', asAdmin)
      .send(reason)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.status).toBe('DRAFT')
  })

  it('publishing a resubmission clears the suspension', async () => {
    await resubmitted()
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.publishedListingId } })
    expect(row.status).toBe('PUBLISHED')
    expect(row.suspensionReason).toBeNull()
  })

  it('flags resubmittedAfterSuspension in the queue', async () => {
    await resubmitted()
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    const items = adminListingQueueResponse.parse(res.body).items
    const flag = (id: string) => items.find((item) => item.id === id)?.resubmittedAfterSuspension
    expect(flag(seed.publishedListingId)).toBe(true)
    expect(flag(seed.draftListingId)).toBe(false)
  })
})

describe('Changes since approval (BR-018)', () => {
  const partner = JSON.stringify({ userId: 'u1', orgId: 'co_alpha', globalRole: 'USER' })
  const editAbout = (about: string) =>
    testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', partner)
      .send({ about })
  const detail = async () =>
    adminListingDetail.parse(
      (
        await testApp()
          .get(`/api/v1/admin/listings/${seed.publishedListingId}`)
          .set('x-test-auth', asAdmin)
      ).body,
    )
  const markReviewed = (changedSinceReviewAt: string | null) =>
    testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/mark-reviewed`)
      .set('x-test-auth', asAdmin)
      .send({ changedSinceReviewAt })

  beforeEach(async () => {
    await prisma.organization.update({
      where: { id: seed.orgId },
      data: { clerkOrgId: 'co_alpha' },
    })
  })

  it('lists changed listings with ?changed=true, oldest change first', async () => {
    const second = await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'alpha-second',
        name: 'Alpha Second',
        status: 'PUBLISHED',
        firstPublishedAt: new Date('2026-01-01T00:00:00Z'),
        organizationId: seed.orgId,
        cityId: (await prisma.city.findFirstOrThrow()).id,
        changedSinceReviewAt: new Date('2026-05-01T00:00:00Z'),
      },
    })
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { changedSinceReviewAt: new Date('2026-06-01T00:00:00Z') },
    })
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'alpha-unchanged',
        name: 'Alpha Unchanged',
        status: 'PUBLISHED',
        organizationId: seed.orgId,
        cityId: second.cityId,
      },
    })
    const res = await testApp()
      .get('/api/v1/admin/listings?changed=true')
      .set('x-test-auth', asAdmin)
    const body = adminListingQueueResponse.parse(res.body)
    expect(body.items.map((item) => item.id)).toEqual([second.id, seed.publishedListingId])
  })

  it('searches by name or slug with q', async () => {
    const found = await testApp()
      .get('/api/v1/admin/listings?status=PUBLISHED&q=ALPHA')
      .set('x-test-auth', asAdmin)
    expect(adminListingQueueResponse.parse(found.body).items.map((item) => item.slug)).toEqual([
      'alpha-academy',
    ])
    const none = await testApp()
      .get('/api/v1/admin/listings?status=PUBLISHED&q=nomatch')
      .set('x-test-auth', asAdmin)
    expect(adminListingQueueResponse.parse(none.body).total).toBe(0)
  })

  it('shows before and after in the detail', async () => {
    await editAbout('New about text')
    const body = await detail()
    expect(body.changes).toEqual([{ field: 'about', before: null, after: 'New about text' }])
    expect(body.changedFieldCount).toBe(1)
  })

  it('marks reviewed with the current token', async () => {
    await editAbout('New about text')
    const res = await markReviewed((await detail()).changedSinceReviewAt)
    expect(res.status).toBe(200)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.publishedListingId } })
    expect(row.changedSinceReviewAt).toBeNull()
    expect((row.reviewedSnapshot as Record<string, unknown>).about).toBe('New about text')
  })

  it('409s REVIEW_STALE when the change token is old', async () => {
    await editAbout('New about text')
    const seen = (await detail()).changedSinceReviewAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    await editAbout('Edited again after the admin looked')
    const res = await markReviewed(seen)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('REVIEW_STALE')
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.publishedListingId } })
    expect(row.changedSinceReviewAt).not.toBeNull()
  })

  it('409s mark-reviewed on a listing that is not published', async () => {
    await editAbout('New about text')
    const seen = (await detail()).changedSinceReviewAt
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    const res = await markReviewed(seen)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('400s mark-reviewed without a token', async () => {
    expect((await markReviewed(null)).status).toBe(400)
  })

  it('publish takes the snapshot', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect((row.reviewedSnapshot as Record<string, unknown>).name).toBe(row.name)
    expect(row.changedSinceReviewAt).toBeNull()
  })
})

describe('publicCacheCleared on decisions that change the public site (REQ-002)', () => {
  it('is reported by publish, suspend and reinstate (false with no web app configured)', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const published = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    const suspended = await suspend(seed.draftListingId)
    const reinstated = await reinstate(seed.draftListingId)
    for (const res of [published, suspended, reinstated]) {
      expect(res.status).toBe(200)
      expect(adminDecisionResponse.parse(res.body).publicCacheCleared).toBe(false)
    }
  })
})
