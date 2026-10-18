import type { AdminListingQueueQuery, AdminListingSummary, Paginated } from '@one/shared'
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js'
import * as repo from './listings.repository.js'

export type ListingVertical = 'INSTITUTE' | 'HOSTEL'

/// Resolves a public slug to a listing, following a redirect left behind by a
/// pre-publication rename (BR-002). Unpublished listings are indistinguishable
/// from missing ones to the public (BR-009).
export async function resolvePublishedSlug(slug: string) {
  const direct = await repo.findBySlug(slug)
  if (direct) {
    if (direct.status !== 'PUBLISHED') throw new NotFoundError('Institute not found')
    return { listingId: direct.id, canonicalSlug: direct.slug, redirected: false }
  }

  const viaRedirect = await repo.findRedirectTarget(slug)
  if (!viaRedirect || viaRedirect.status !== 'PUBLISHED') {
    throw new NotFoundError('Institute not found')
  }
  return { listingId: viaRedirect.id, canonicalSlug: viaRedirect.slug, redirected: true }
}

export async function assertOrgOwnsListing(listingId: string, organizationId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.organizationId !== organizationId) {
    throw new ForbiddenError('Listing belongs to another organisation')
  }
}

/// BR-002: a published slug is frozen. Google is the acquisition channel, so a
/// changed URL is lost traffic.
export async function changeSlug(listingId: string, nextSlug: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')

  if (listing.status === 'PUBLISHED') {
    throw new ConflictError('SLUG_IMMUTABLE', 'A published listing slug cannot be changed')
  }
  if (listing.slug === nextSlug) return

  await repo.updateSlug(listingId, nextSlug)
}

export async function submitForReview(listingId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'DRAFT') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a DRAFT listing can be submitted; this listing is ${listing.status}`,
    )
  }
  await repo.markSubmitted(listingId)
}

export async function publish(listingId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW' && listing.status !== 'DRAFT') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Cannot publish a listing in status ${listing.status}`,
    )
  }
  await repo.updateStatus(listingId, 'PUBLISHED', new Date())
}

export async function isPublished(listingId: string) {
  const listing = await repo.findById(listingId)
  return listing?.status === 'PUBLISHED'
}

function toAdminSummary(row: repo.ModerationRow): AdminListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    organizationName: row.organization.name,
    cityName: row.city.name,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listForModeration(
  query: AdminListingQueueQuery,
): Promise<Paginated<AdminListingSummary>> {
  const { rows, total } = await repo.listByStatus(
    query.status,
    (query.page - 1) * query.limit,
    query.limit,
  )
  return { items: rows.map(toAdminSummary), total, page: query.page, limit: query.limit }
}

export async function publishAsAdmin(listingId: string): Promise<AdminListingSummary> {
  await publish(listingId)
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}

/// A slug is taken if a listing holds it or a redirect still answers for it;
/// reusing a redirect's old slug would hijack its traffic.
export async function isSlugTaken(slug: string): Promise<boolean> {
  return (await repo.findBySlug(slug)) !== null || (await repo.findRedirectTarget(slug)) !== null
}
