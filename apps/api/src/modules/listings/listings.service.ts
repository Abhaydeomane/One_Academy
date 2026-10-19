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

/// A listing leaving review unpublished goes back to where it came from. One
/// that was ever public can only have come from SUSPENDED, so no column is
/// needed to remember it — and returning it to DRAFT would make it look
/// never-public to every check that reads status.
export function returnStatusFor(listing: { firstPublishedAt: Date | null }): repo.ReturnStatus {
  return hasEverBeenPublished(listing) ? 'SUSPENDED' : 'DRAFT'
}

/// A DRAFT, or a SUSPENDED listing whose partner has fixed it (BR-016).
export async function submitForReview(listingId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'DRAFT' && listing.status !== 'SUSPENDED') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a DRAFT or SUSPENDED listing can be submitted; this listing is ${listing.status}`,
    )
  }
  if ((await repo.markSubmitted(listingId, listing.status)) === 0) {
    throw new ConflictError('INVALID_STATUS_TRANSITION', 'This listing changed; reload and retry')
  }
}

/// BR-017: the only way to edit a listing in review is to take it out.
export async function withdrawFromReview(listingId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a listing in review can be withdrawn; this listing is ${listing.status}`,
    )
  }
  if ((await repo.markWithdrawn(listingId, returnStatusFor(listing))) === 0) {
    throw new ConflictError('INVALID_STATUS_TRANSITION', 'This listing was already reviewed')
  }
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
    suspensionReason: row.suspensionReason,
    resubmittedAfterSuspension: row.status === 'PENDING_REVIEW' && row.firstPublishedAt !== null,
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
    suspendedAt: row.suspendedAt ? row.suspendedAt.toISOString() : null,
    firstPublishedAt: row.firstPublishedAt ? row.firstPublishedAt.toISOString() : null,
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
/// back to DRAFT (or SUSPENDED, if it was ever public) so the partner can fix it.
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
  if ((await repo.markRejected(listingId, reason, returnStatusFor(listing))) === 0) {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      'This listing was decided by another admin; reload and retry',
    )
  }
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}

async function moderationSummary(listingId: string): Promise<AdminListingSummary> {
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}

/// BR-015: only a live listing can be suspended, and only by an admin (the
/// router enforces that). The partner sees the reason.
export async function suspendAsAdmin(
  listingId: string,
  reason: string,
  adminClerkUserId: string,
): Promise<AdminListingSummary> {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PUBLISHED') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a published listing can be suspended; this listing is ${listing.status}`,
    )
  }
  if ((await repo.markSuspended(listingId, reason, new Date(), adminClerkUserId)) === 0) {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      'This listing was changed by another admin; reload and retry',
    )
  }
  return moderationSummary(listingId)
}

/// BR-016: lifting a suspension puts the listing straight back on the site.
export async function reinstateAsAdmin(listingId: string): Promise<AdminListingSummary> {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'SUSPENDED') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a suspended listing can be reinstated; this listing is ${listing.status}`,
    )
  }
  if ((await repo.markReinstated(listingId)) === 0) {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      'This listing was changed by another admin; reload and retry',
    )
  }
  return moderationSummary(listingId)
}

/// A slug is taken if a listing holds it or a redirect still answers for it;
/// reusing a redirect's old slug would hijack its traffic.
export async function isSlugTaken(slug: string): Promise<boolean> {
  return (await repo.findBySlug(slug)) !== null || (await repo.findRedirectTarget(slug)) !== null
}
