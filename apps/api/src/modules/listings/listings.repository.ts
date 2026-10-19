import { prisma } from '@one/db'

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

export type ModerationRow = {
  id: string
  slug: string
  name: string
  status: ListingStatus
  updatedAt: Date
  submittedAt: Date | null
  address: string | null
  contactPhone: string | null
  suspensionReason: string | null
  organization: { name: string; verifiedAt: Date | null }
  city: { name: string }
  instituteProfile: { website: string | null } | null
}

const MODERATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  updatedAt: true,
  submittedAt: true,
  address: true,
  contactPhone: true,
  suspensionReason: true,
  organization: { select: { name: true, verifiedAt: true } },
  city: { select: { name: true } },
  instituteProfile: { select: { website: true } },
} as const

export type ModerationDetailRow = Omit<ModerationRow, 'instituteProfile'> & {
  locality: string | null
  shortDescription: string | null
  rejectionReason: string | null
  suspendedAt: Date | null
  firstPublishedAt: Date | null
  instituteProfile: { website: string | null; about: string | null; modes: Mode[] } | null
  tags: { tag: { slug: string; kind: 'EXAM' | 'AMENITY' | 'FACILITY' } }[]
  _count: { batches: number }
}

const MODERATION_DETAIL_SELECT = {
  ...MODERATION_SELECT,
  locality: true,
  shortDescription: true,
  rejectionReason: true,
  suspendedAt: true,
  firstPublishedAt: true,
  instituteProfile: { select: { website: true, about: true, modes: true } },
  tags: { select: { tag: { select: { slug: true, kind: true } } } },
  _count: { select: { batches: true } },
} as const

export async function listByStatus(
  status: ListingStatus,
  skip: number,
  take: number,
): Promise<{ rows: ModerationRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where: { status },
      orderBy: [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'asc' }],
      skip,
      take,
      select: MODERATION_SELECT,
    }),
    prisma.listing.count({ where: { status } }),
  ])
  return { rows, total }
}

export async function findModerationRow(id: string): Promise<ModerationRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: MODERATION_SELECT })
}

export async function markSubmitted(id: string): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: { status: 'PENDING_REVIEW', submittedAt: new Date(), rejectionReason: null },
  })
}

export async function findModerationDetail(id: string): Promise<ModerationDetailRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: MODERATION_DETAIL_SELECT })
}

/// Conditional on PENDING_REVIEW so two concurrent admin decisions cannot both
/// win. Returns the number of rows changed (0 means someone else decided first).
export async function markRejected(id: string, reason: string): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { id, status: 'PENDING_REVIEW' },
    data: { status: 'DRAFT', rejectionReason: reason },
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
/// admin decision got there first.
export async function publishAndVerify(
  id: string,
  organizationId: string,
  at: Date,
  verifierClerkUserId: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: 'PUBLISHED', publishedAt: at, rejectionReason: null, ...NOT_SUSPENDED },
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
