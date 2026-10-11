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
