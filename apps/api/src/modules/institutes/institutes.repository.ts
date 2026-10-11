import { prisma } from '@one/db'

export type Mode = 'ONLINE' | 'OFFLINE' | 'HYBRID'

export type InstituteRow = {
  id: string
  slug: string
  name: string
  locality: string | null
  shortDescription: string | null
  ratingAvg: number
  ratingCount: number
  publishedAt: Date | null
  city: { slug: string; name: string }
  instituteProfile: {
    modes: Mode[]
    about: string | null
    website: string | null
    establishedYear: number | null
    facultyCount: number | null
  } | null
  tags: { tag: { slug: string; kind: 'EXAM' | 'AMENITY' | 'FACILITY' } }[]
  media: { url: string; alt: string | null }[]
}

const SELECT = {
  id: true,
  slug: true,
  name: true,
  locality: true,
  shortDescription: true,
  ratingAvg: true,
  ratingCount: true,
  publishedAt: true,
  city: { select: { slug: true, name: true } },
  instituteProfile: {
    select: {
      modes: true,
      about: true,
      website: true,
      establishedYear: true,
      facultyCount: true,
    },
  },
  tags: { select: { tag: { select: { slug: true, kind: true } } } },
  media: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' as const } },
} as const

export type ListFilters = {
  citySlug?: string
  examSlug?: string
  mode?: Mode
  sort: 'recent' | 'rating' | 'name'
  skip: number
  take: number
}

function buildWhere(filters: ListFilters) {
  return {
    vertical: 'INSTITUTE' as const,
    // BR-009 is applied here, at the data boundary, so no caller can forget it.
    status: 'PUBLISHED' as const,
    ...(filters.citySlug ? { city: { slug: filters.citySlug } } : {}),
    ...(filters.examSlug
      ? { tags: { some: { tag: { slug: filters.examSlug, kind: 'EXAM' as const } } } }
      : {}),
    ...(filters.mode ? { instituteProfile: { modes: { has: filters.mode } } } : {}),
  }
}

const ORDER_BY = {
  recent: { publishedAt: 'desc' as const },
  rating: { ratingAvg: 'desc' as const },
  name: { name: 'asc' as const },
}

export async function listPublished(
  filters: ListFilters,
): Promise<{ rows: InstituteRow[]; total: number }> {
  const where = buildWhere(filters)
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: ORDER_BY[filters.sort],
      skip: filters.skip,
      take: filters.take,
      select: SELECT,
    }),
    prisma.listing.count({ where }),
  ])
  return { rows, total }
}

export async function findPublishedById(id: string): Promise<InstituteRow | null> {
  return prisma.listing.findFirst({
    where: { id, vertical: 'INSTITUTE', status: 'PUBLISHED' },
    select: SELECT,
  })
}

export type PartnerListingRow = {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'SUSPENDED'
  shortDescription: string | null
  updatedAt: Date
  city: { name: string }
  instituteProfile: { about: string | null; website: string | null } | null
  _count: { batches: number }
}

const PARTNER_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  shortDescription: true,
  updatedAt: true,
  city: { select: { name: true } },
  instituteProfile: { select: { about: true, website: true } },
  _count: { select: { batches: true } },
} as const

export async function listByOrg(organizationId: string): Promise<PartnerListingRow[]> {
  return prisma.listing.findMany({
    where: { organizationId, vertical: 'INSTITUTE' },
    orderBy: { updatedAt: 'desc' },
    select: PARTNER_SELECT,
  })
}

export async function findByIdForPartner(id: string): Promise<PartnerListingRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: PARTNER_SELECT })
}

export async function updateListingAndProfile(
  id: string,
  listing: { name?: string; shortDescription?: string; locality?: string },
  profile: {
    about?: string
    website?: string
    establishedYear?: number
    facultyCount?: number
    modes?: Mode[]
  },
): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: {
      ...listing,
      ...(Object.keys(profile).length > 0
        ? { instituteProfile: { upsert: { create: profile, update: profile } } }
        : {}),
    },
  })
}
