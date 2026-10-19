import type {
  AdminListingDetail,
  AdminListingQueueQuery,
  AdminListingSummary,
  Paginated,
} from '@one/shared'
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

/// BR-002: once a listing has been public its slug and city are frozen,
/// whatever its status now. A suspended or resubmitted listing is still the
/// URL Google holds.
export function hasEverBeenPublished(listing: { firstPublishedAt: Date | null }): boolean {
  return listing.firstPublishedAt !== null
}

/// BR-002: a published slug is frozen. Google is the acquisition channel, so a
/// changed URL is lost traffic.
export async function changeSlug(listingId: string, nextSlug: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')

  if (hasEverBeenPublished(listing)) {
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

export async function publish(listingId: string, verifierClerkUserId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a listing waiting for review can be published; this listing is ${listing.status}`,
    )
  }
  const published = await repo.publishAndVerify(
    listingId,
    listing.organizationId,
    new Date(),
    verifierClerkUserId,
  )
  if (!published) {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      'This listing was decided by another admin; reload and retry',
    )
  }
}

export async function isPublished(listingId: string) {
  const listing = await repo.findById(listingId)
  return listing?.status === 'PUBLISHED'
}

function toAdminSummary(row: repo.ModerationRow | repo.ModerationDetailRow): AdminListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    organizationName: row.organization.name,
    newInstitute: row.organization.verifiedAt === null,
    cityName: row.city.name,
    address: row.address,
    contactPhone: row.contactPhone,
    website: row.instituteProfile?.website ?? null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getForModeration(listingId: string): Promise<AdminListingDetail> {
  const row = await repo.findModerationDetail(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return {
    ...toAdminSummary(row),
    locality: row.locality,
    shortDescription: row.shortDescription,
    about: row.instituteProfile?.about ?? null,
    modes: row.instituteProfile?.modes ?? [],
    exams: row.tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug),
    batchCount: row._count.batches,
    rejectionReason: row.rejectionReason,
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

export async function publishAsAdmin(
  listingId: string,
  adminClerkUserId: string,
): Promise<AdminListingSummary> {
  await publish(listingId, adminClerkUserId)
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}

/// BR-014: only a listing waiting for review can be rejected, and it goes
/// back to DRAFT so the partner can fix it.
export async function rejectAsAdmin(
  listingId: string,
  reason: string,
): Promise<AdminListingSummary> {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a listing waiting for review can be rejected; this listing is ${listing.status}`,
    )
  }
  if ((await repo.markRejected(listingId, reason)) === 0) {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      'This listing was decided by another admin; reload and retry',
    )
  }
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}

/// A slug is taken if a listing holds it or a redirect still answers for it;
/// reusing a redirect's old slug would hijack its traffic.
export async function isSlugTaken(slug: string): Promise<boolean> {
  return (await repo.findBySlug(slug)) !== null || (await repo.findRedirectTarget(slug)) !== null
}
