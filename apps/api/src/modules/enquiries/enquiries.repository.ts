import { prisma } from '@one/db'

export type EnquiryRow = {
  id: string
  listingId: string
  batchId: string | null
  name: string
  phone: string
  email: string | null
  message: string | null
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED'
  createdAt: Date
}

const SELECT = {
  id: true,
  listingId: true,
  batchId: true,
  name: true,
  phone: true,
  email: true,
  message: true,
  status: true,
  createdAt: true,
} as const

export async function create(data: {
  listingId: string
  vertical: 'INSTITUTE' | 'HOSTEL'
  batchId?: string
  name: string
  phone: string
  email?: string
  message?: string
}): Promise<EnquiryRow> {
  return prisma.enquiry.create({ data, select: SELECT })
}

export async function listByListing(listingId: string): Promise<EnquiryRow[]> {
  return prisma.enquiry.findMany({
    where: { listingId },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  })
}
