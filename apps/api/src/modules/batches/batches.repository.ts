import { prisma } from '@one/db'

export type BatchRow = {
  id: string
  listingId: string
  title: string
  exam: string
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID'
  startDate: Date
  endDate: Date | null
  scheduleText: string | null
  seatsTotal: number
  seatsAvailable: number
  feeAmount: number
  feeCurrency: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

const SELECT = {
  id: true,
  listingId: true,
  title: true,
  exam: true,
  mode: true,
  startDate: true,
  endDate: true,
  scheduleText: true,
  seatsTotal: true,
  seatsAvailable: true,
  feeAmount: true,
  feeCurrency: true,
  status: true,
} as const

export async function listPublishedByListing(listingId: string): Promise<BatchRow[]> {
  return prisma.batch.findMany({
    where: { listingId, status: 'PUBLISHED' },
    orderBy: { startDate: 'asc' },
    select: SELECT,
  })
}

/// Upcoming means startDate >= now. Comparison needs this and the rest of the
/// app does not have it: search cards, landing cards and the detail page all
/// say "upcoming" while counting every published batch (BUG-002). Fixing that
/// moves P1a/P1b fee expectations and landing indexability, so it is not done
/// here — but a comparison that defaults to a batch which already started
/// would break the one promise the feature makes.
///
/// Ordered cheapest-first so the caller can take [0] as the default pin.
export async function listUpcomingPublishedByListing(listingId: string): Promise<BatchRow[]> {
  return prisma.batch.findMany({
    where: { listingId, status: 'PUBLISHED', startDate: { gte: new Date() } },
    orderBy: [{ feeAmount: 'asc' }, { startDate: 'asc' }],
    select: SELECT,
  })
}

export async function listAllByListing(listingId: string): Promise<BatchRow[]> {
  return prisma.batch.findMany({
    where: { listingId },
    orderBy: { startDate: 'asc' },
    select: SELECT,
  })
}

export async function countPublishedByListingIds(
  listingIds: string[],
): Promise<Map<string, number>> {
  const grouped = await prisma.batch.groupBy({
    by: ['listingId'],
    where: { listingId: { in: listingIds }, status: 'PUBLISHED' },
    _count: { _all: true },
  })
  return new Map(grouped.map((row) => [row.listingId, row._count._all]))
}

export async function findById(id: string): Promise<BatchRow | null> {
  return prisma.batch.findUnique({ where: { id }, select: SELECT })
}

export async function belongsToListing(batchId: string, listingId: string): Promise<boolean> {
  const count = await prisma.batch.count({ where: { id: batchId, listingId } })
  return count === 1
}

export async function create(data: {
  listingId: string
  title: string
  exam: string
  mode: BatchRow['mode']
  startDate: Date
  endDate?: Date
  scheduleText?: string
  seatsTotal: number
  seatsAvailable: number
  feeAmount: number
  feeCurrency: string
}): Promise<BatchRow> {
  return prisma.batch.create({ data, select: SELECT })
}

export async function update(
  id: string,
  data: Partial<Omit<BatchRow, 'id' | 'listingId'>>,
): Promise<BatchRow> {
  return prisma.batch.update({ where: { id }, data, select: SELECT })
}
