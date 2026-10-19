import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@one/db'
import { adminListingDetail, mediaAsset } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'
import { solidImage } from '../../../test/helpers/images.js'

vi.mock('../../lib/clerk.js', () => ({ fetchClerkOrganization: vi.fn() }))

let seed: MinimalSeed
let jpeg: Buffer

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
  await prisma.organization.update({ where: { id: seed.orgId }, data: { clerkOrgId: 'co_alpha' } })
  jpeg ??= await solidImage({ width: 800, height: 600, format: 'jpeg' })
})

afterAll(async () => {
  await prisma.$disconnect()
})

const asAdmin = JSON.stringify({ userId: 'u-admin', globalRole: 'ADMIN' })
const asUser = JSON.stringify({ userId: 'u1', orgId: 'co_alpha', globalRole: 'USER' })

const upload = async (listingId: string) =>
  mediaAsset.parse(
    (
      await testApp()
        .post(`/api/v1/partner/listings/${listingId}/media`)
        .set('x-test-auth', asUser)
        .field('purpose', 'PHOTO')
        .attach('file', jpeg, 'p.jpg')
    ).body,
  )

const remove = (listingId: string, assetId: string, who = asAdmin) =>
  testApp().delete(`/api/v1/admin/listings/${listingId}/media/${assetId}`).set('x-test-auth', who)

describe('DELETE /api/v1/admin/listings/:listingId/media/:assetId', () => {
  it('403s a non-admin', async () => {
    const asset = await upload(seed.draftListingId)
    expect((await remove(seed.draftListingId, asset.id, asUser)).status).toBe(403)
    expect(await prisma.mediaAsset.count()).toBe(1)
  })

  it.each(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED'] as const)(
    'deletes a photo in %s',
    async (status) => {
      const asset = await upload(seed.draftListingId)
      await prisma.listing.update({ where: { id: seed.draftListingId }, data: { status } })
      const res = await remove(seed.draftListingId, asset.id)
      expect(res.status).toBe(200)
      expect(typeof res.body.publicCacheCleared).toBe('boolean')
      expect(await prisma.mediaAsset.count()).toBe(0)
    },
  )

  it('admin delete does not flag the listing', async () => {
    const asset = await upload(seed.publishedListingId)
    const before = adminListingDetail.parse(
      (
        await testApp()
          .get(`/api/v1/admin/listings/${seed.publishedListingId}`)
          .set('x-test-auth', asAdmin)
      ).body,
    )
    await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/mark-reviewed`)
      .set('x-test-auth', asAdmin)
      .send({ changedSinceReviewAt: before.changedSinceReviewAt })

    expect((await remove(seed.publishedListingId, asset.id)).status).toBe(200)

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.publishedListingId } })
    expect(row.changedSinceReviewAt).toBeNull()
    const after = adminListingDetail.parse(
      (
        await testApp()
          .get(`/api/v1/admin/listings/${seed.publishedListingId}`)
          .set('x-test-auth', asAdmin)
      ).body,
    )
    expect(after.changes).toEqual([])
    expect(after.media).toEqual([])
  })

  it('404s an asset of another listing', async () => {
    const asset = await upload(seed.draftListingId)
    expect((await remove(seed.publishedListingId, asset.id)).status).toBe(404)
    expect(await prisma.mediaAsset.count()).toBe(1)
  })
})

describe('GET /api/v1/admin/listings/:listingId — media', () => {
  it('admin detail includes media with URLs', async () => {
    const asset = await upload(seed.draftListingId)
    const detail = adminListingDetail.parse(
      (
        await testApp()
          .get(`/api/v1/admin/listings/${seed.draftListingId}`)
          .set('x-test-auth', asAdmin)
      ).body,
    )
    expect(detail.media).toEqual([asset])
  })
})
