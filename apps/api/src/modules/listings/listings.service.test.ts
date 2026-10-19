import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import {
  assertOrgOwnsListing,
  changeSlug,
  publish,
  resolvePublishedSlug,
  submitForReview,
} from './listings.service.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('resolvePublishedSlug (BR-009)', () => {
  it('resolves a published slug', async () => {
    const result = await resolvePublishedSlug(seed.publishedSlug)
    expect(result.listingId).toBe(seed.publishedListingId)
    expect(result.redirected).toBe(false)
  })

  it('refuses a draft listing', async () => {
    await expect(resolvePublishedSlug(seed.draftSlug)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses an unknown slug', async () => {
    await expect(resolvePublishedSlug('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('follows a redirect to the canonical slug (BR-002)', async () => {
    await prisma.listingRedirect.create({
      data: { oldSlug: 'old-alpha', listingId: seed.publishedListingId },
    })
    const result = await resolvePublishedSlug('old-alpha')
    expect(result.canonicalSlug).toBe(seed.publishedSlug)
    expect(result.redirected).toBe(true)
  })

  it('does not follow a redirect to an unpublished listing', async () => {
    await prisma.listingRedirect.create({
      data: { oldSlug: 'old-draft', listingId: seed.draftListingId },
    })
    await expect(resolvePublishedSlug('old-draft')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('assertOrgOwnsListing', () => {
  it('passes for the owning organisation', async () => {
    await expect(assertOrgOwnsListing(seed.publishedListingId, seed.orgId)).resolves.toBeUndefined()
  })

  it('forbids another organisation', async () => {
    await expect(
      assertOrgOwnsListing(seed.publishedListingId, seed.otherOrgId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('reports a missing listing as not found', async () => {
    await expect(assertOrgOwnsListing('missing', seed.orgId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('changeSlug (BR-002)', () => {
  it('refuses to change a published slug', async () => {
    await expect(changeSlug(seed.publishedListingId, 'new-slug')).rejects.toMatchObject({
      code: 'SLUG_IMMUTABLE',
    })
  })

  it('refuses a SUSPENDED listing that was published', async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    await expect(changeSlug(seed.publishedListingId, 'new-slug')).rejects.toMatchObject({
      code: 'SLUG_IMMUTABLE',
    })
  })

  it('allows changing a draft slug', async () => {
    await changeSlug(seed.draftListingId, 'renamed-draft')
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.slug).toBe('renamed-draft')
  })
})

describe('status transitions', () => {
  it('moves DRAFT to PENDING_REVIEW', async () => {
    await submitForReview(seed.draftListingId)
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('PENDING_REVIEW')
  })

  it('refuses to submit an already published listing', async () => {
    await expect(submitForReview(seed.publishedListingId)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
  })

  it('publishes a pending listing and stamps publishedAt', async () => {
    await submitForReview(seed.draftListingId)
    await publish(seed.draftListingId, 'u-admin')
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('PUBLISHED')
    expect(listing.publishedAt).toBeInstanceOf(Date)
  })

  it('refuses to publish an already published listing', async () => {
    await expect(publish(seed.publishedListingId, 'u-admin')).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
  })
})
