import { prisma } from '@one/db'

// Repositories return plain row types, never Prisma model types, so Prisma
// stays replaceable and services never depend on the ORM's shapes.
export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'SUSPENDED'

export type ListingCore = {
  id: string
  slug: string
  status: ListingStatus
  organizationId: string
}

const CORE_SELECT = { id: true, slug: true, status: true, organizationId: true } as const

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

export async function updateStatus(
  id: string,
  status: ListingStatus,
  publishedAt?: Date,
): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: { status, ...(publishedAt ? { publishedAt } : {}) },
  })
}

export type ModerationRow = {
  id: string
  slug: string
  name: string
  status: ListingStatus
  updatedAt: Date
  organization: { name: string }
  city: { name: string }
}

const MODERATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  updatedAt: true,
  organization: { select: { name: true } },
  city: { select: { name: true } },
} as const

export async function listByStatus(
  status: ListingStatus,
  skip: number,
  take: number,
): Promise<{ rows: ModerationRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where: { status },
      orderBy: { updatedAt: 'asc' },
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
