import { prisma } from '@one/db'
import type { WatchedSnapshot } from '@one/shared'

// Repositories return plain row types, never Prisma model types, so Prisma
// stays replaceable and services never depend on the ORM's shapes.
export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'SUSPENDED'

export type ListingCore = {
  id: string
  slug: string
  status: ListingStatus
  organizationId: string
  firstPublishedAt: Date | null
}

const CORE_SELECT = {
  id: true,
  slug: true,
  status: true,
  organizationId: true,
  firstPublishedAt: true,
} as const

export async function findBySlug(slug: string): Promise<ListingCore | null> {
  return prisma.listing.findUnique({ where: { slug }, select: CORE_SELECT })
}

export async function findById(id: string): Promise<ListingCore | null> {
  return prisma.listing.findUnique({ where: { id }, select: CORE_SELECT })
}

export async function findRedirectTarget(oldSlug: string): Promise<ListingCore | null> {
  const redirect = await prisma.listingRedirect.findUnique({
    where: { oldSlug },
    select: { listing: { select: CORE_SELECT } },
  })
  return redirect?.listing ?? null
}

export async function updateSlug(id: string, slug: string): Promise<void> {
  await prisma.listing.update({ where: { id }, data: { slug } })
}

export async function createRedirect(listingId: string, oldSlug: string): Promise<void> {
  await prisma.listingRedirect.create({ data: { listingId, oldSlug } })
}

type Mode = 'ONLINE' | 'OFFLINE' | 'HYBRID'

/// Everything BR-018 compares: the watched fields, plus what decides whether
/// they are compared at all.
export type WatchedRow = {
  status: ListingStatus
  firstPublishedAt: Date | null
  reviewedSnapshot: unknown
  changedSinceReviewAt: Date | null
  name: string
  shortDescription: string | null
  locality: string | null
  address: string | null
  contactPhone: string | null
  instituteProfile: {
    about: string | null
    website: string | null
    establishedYear: number | null
    facultyCount: number | null
    modes: Mode[]
  } | null
  tags: { tag: { slug: string; kind: 'EXAM' | 'AMENITY' | 'FACILITY' } }[]
  /// Ordered by sortOrder (P2c); the service puts the logo first. Declared here, not
  /// imported: a repository reaches into nothing outside its module (R4).
  media: {
    id: string
    purpose: 'LOGO' | 'PHOTO'
    storageKey: string
    alt: string | null
    width: number
    height: number
    sortOrder: number
  }[]
}

const WATCHED_SELECT = {
  status: true,
  firstPublishedAt: true,
  reviewedSnapshot: true,
  changedSinceReviewAt: true,
  name: true,
  shortDescription: true,
  locality: true,
  address: true,
  contactPhone: true,
  instituteProfile: {
    select: { about: true, website: true, establishedYear: true, facultyCount: true, modes: true },
  },
  tags: { select: { tag: { select: { slug: true, kind: true } } } },
  media: {
    select: {
      id: true,
      purpose: true,
      storageKey: true,
      alt: true,
      width: true,
      height: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: 'asc' },
  },
} as const

export type ModerationRow = WatchedRow & {
  id: string
  slug: string
  updatedAt: Date
  submittedAt: Date | null
  suspensionReason: string | null
  organization: { name: string; verifiedAt: Date | null }
  city: { name: string }
}

const MODERATION_SELECT = {
  ...WATCHED_SELECT,
  id: true,
  slug: true,
  updatedAt: true,
  submittedAt: true,
  suspensionReason: true,
  organization: { select: { name: true, verifiedAt: true } },
  city: { select: { name: true } },
} as const

export type ModerationDetailRow = ModerationRow & {
  rejectionReason: string | null
  suspendedAt: Date | null
  _count: { batches: number }
}

const MODERATION_DETAIL_SELECT = {
  ...MODERATION_SELECT,
  rejectionReason: true,
  suspendedAt: true,
  _count: { select: { batches: true } },
} as const

export async function findWatchedRow(id: string): Promise<WatchedRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: WATCHED_SELECT })
}

export async function saveSnapshot(id: string, snapshot: WatchedSnapshot): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: { reviewedSnapshot: snapshot, changedSinceReviewAt: null },
  })
}

/// Replaces the stored snapshot without touching the change flag.
export async function updateSnapshot(id: string, snapshot: WatchedSnapshot): Promise<void> {
  await prisma.listing.update({ where: { id }, data: { reviewedSnapshot: snapshot } })
}

export async function setChangedSinceReview(id: string, at: Date | null): Promise<void> {
  await prisma.listing.update({ where: { id }, data: { changedSinceReviewAt: at } })
}

/// BR-018. Conditional on the token the admin saw, so changes made after they
/// looked are never silently approved. Returns the rows changed.
export async function markReviewed(
  id: string,
  seen: Date,
  snapshot: WatchedSnapshot,
): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: 'PUBLISHED', changedSinceReviewAt: seen },
    data: { reviewedSnapshot: snapshot, changedSinceReviewAt: null },
  })
  return result.count
}

export type ModerationFilter = { status: ListingStatus; changed?: boolean; q?: string }

export async function listForModeration(
  filter: ModerationFilter,
  skip: number,
  take: number,
): Promise<{ rows: ModerationRow[]; total: number }> {
  const where = {
    ...(filter.changed
      ? { status: 'PUBLISHED' as const, changedSinceReviewAt: { not: null } }
      : { status: filter.status }),
    ...(filter.q
      ? {
          OR: [
            { name: { contains: filter.q, mode: 'insensitive' as const } },
            { slug: { contains: filter.q.toLowerCase() } },
          ],
        }
      : {}),
  }
  const orderBy = filter.changed
    ? [{ changedSinceReviewAt: 'asc' as const }]
    : [
        { submittedAt: { sort: 'asc' as const, nulls: 'last' as const } },
        { updatedAt: 'asc' as const },
      ]
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({ where, orderBy, skip, take, select: MODERATION_SELECT }),
    prisma.listing.count({ where }),
  ])
  return { rows, total }
}

export async function findModerationRow(id: string): Promise<ModerationRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: MODERATION_SELECT })
}

/// Where a listing goes when it leaves review without being published.
export type ReturnStatus = 'DRAFT' | 'SUSPENDED'

/// Conditional on the status the caller saw, so a submit racing another
/// transition changes nothing. Returns the rows changed.
export async function markSubmitted(id: string, from: ReturnStatus): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: from },
    data: { status: 'PENDING_REVIEW', submittedAt: new Date(), rejectionReason: null },
  })
  return result.count
}

/// BR-017: the partner takes a listing out of review to edit it.
export async function markWithdrawn(id: string, returnTo: ReturnStatus): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: 'PENDING_REVIEW' },
    data: { status: returnTo },
  })
  return result.count
}

export async function findModerationDetail(id: string): Promise<ModerationDetailRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: MODERATION_DETAIL_SELECT })
}

/// Conditional on PENDING_REVIEW so two concurrent admin decisions cannot both
/// win. Returns the number of rows changed (0 means someone else decided first).
export async function markRejected(
  id: string,
  reason: string,
  returnTo: ReturnStatus,
): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: 'PENDING_REVIEW' },
    data: { status: returnTo, rejectionReason: reason },
  })
  return result.count
}

const NOT_SUSPENDED = {
  suspensionReason: null,
  suspendedAt: null,
  suspendedByClerkUserId: null,
} as const

/// BR-015. Conditional on PUBLISHED; returns the rows changed (0 means the
/// listing was not live, or a concurrent decision got there first).
export async function markSuspended(
  id: string,
  reason: string,
  at: Date,
  adminClerkUserId: string,
): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: 'PUBLISHED' },
    data: {
      status: 'SUSPENDED',
      suspensionReason: reason,
      suspendedAt: at,
      suspendedByClerkUserId: adminClerkUserId,
    },
  })
  return result.count
}

/// BR-016. Conditional on SUSPENDED; clears the suspension.
export async function markReinstated(id: string): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: 'SUSPENDED' },
    data: { status: 'PUBLISHED', ...NOT_SUSPENDED },
  })
  return result.count
}

/// BR-013 needs the listing and its organisation to change together. The
/// organisation write lives here rather than behind accounts.service because
/// it must share the transaction; the verifiedAt: null guard means an existing
/// verification is never overwritten. The listing write is conditional on the
/// PENDING_REVIEW status; returns false (and verifies nothing) if another
/// admin decision got there first. The approved snapshot (BR-018) is written in
/// the same guarded write.
export async function publishAndVerify(
  id: string,
  organizationId: string,
  at: Date,
  verifierClerkUserId: string,
  snapshot: WatchedSnapshot,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: {
        status: 'PUBLISHED',
        publishedAt: at,
        rejectionReason: null,
        ...NOT_SUSPENDED,
        reviewedSnapshot: snapshot,
        changedSinceReviewAt: null,
      },
    })
    if (listing.count === 0) return false
    await tx.listing.updateMany({
      where: { id, firstPublishedAt: null },
      data: { firstPublishedAt: at },
    })
    await tx.organization.updateMany({
      where: { id: organizationId, verifiedAt: null },
      data: { verifiedAt: at, verifiedByClerkUserId: verifierClerkUserId },
    })
    return true
  })
}
