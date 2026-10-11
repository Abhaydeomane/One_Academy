import type {
  BatchSummary,
  CreateBatchBody,
  PartnerBatchSummary,
  UpdateBatchBody,
} from '@one/shared'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import * as accounts from '../accounts/accounts.service.js'
import { assertOrgOwnsListing, isPublished } from '../listings/listings.service.js'
import * as repo from './batches.repository.js'

/// Routes receive a Clerk organisation id; everything below works in local
/// Organization ids. R4 keeps the route out of the accounts module.
export async function resolveOrganizationId(clerkOrgId: string): Promise<string> {
  return accounts.resolveLocalOrgId(clerkOrgId)
}

export function toSummary(row: repo.BatchRow): BatchSummary {
  return {
    id: row.id,
    title: row.title,
    exam: row.exam,
    mode: row.mode,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    scheduleText: row.scheduleText,
    seatsTotal: row.seatsTotal,
    seatsAvailable: row.seatsAvailable,
    feeAmount: row.feeAmount,
    feeCurrency: row.feeCurrency,
  }
}

function toPartnerSummary(row: repo.BatchRow): PartnerBatchSummary {
  return { ...toSummary(row), status: row.status }
}

// BR-010. Rejected rather than clamped: silently changing a partner's number
// would be worse than telling them it is impossible.
function assertSeats(seatsTotal: number, seatsAvailable: number) {
  if (seatsAvailable < 0 || seatsAvailable > seatsTotal) {
    throw new ConflictError(
      'SEATS_OUT_OF_RANGE',
      `seatsAvailable (${seatsAvailable}) must be between 0 and seatsTotal (${seatsTotal})`,
    )
  }
}

export async function listPublishedForListing(listingId: string): Promise<BatchSummary[]> {
  const rows = await repo.listPublishedByListing(listingId)
  return rows.map(toSummary)
}

export async function listAllForListing(listingId: string): Promise<PartnerBatchSummary[]> {
  const rows = await repo.listAllByListing(listingId)
  return rows.map(toPartnerSummary)
}

export async function countPublishedByListingIds(listingIds: string[]) {
  return repo.countPublishedByListingIds(listingIds)
}

export async function belongsToListing(batchId: string, listingId: string) {
  return repo.belongsToListing(batchId, listingId)
}

export async function createForOrg(
  listingId: string,
  organizationId: string,
  body: CreateBatchBody,
): Promise<BatchSummary> {
  await assertOrgOwnsListing(listingId, organizationId)

  const seatsAvailable = body.seatsAvailable ?? body.seatsTotal
  assertSeats(body.seatsTotal, seatsAvailable)

  const created = await repo.create({
    listingId,
    title: body.title,
    exam: body.exam,
    mode: body.mode,
    startDate: body.startDate,
    ...(body.endDate ? { endDate: body.endDate } : {}),
    ...(body.scheduleText ? { scheduleText: body.scheduleText } : {}),
    seatsTotal: body.seatsTotal,
    seatsAvailable,
    feeAmount: body.feeAmount,
    feeCurrency: body.feeCurrency,
  })

  return toSummary(created)
}

export async function updateForOrg(
  batchId: string,
  organizationId: string,
  body: UpdateBatchBody,
): Promise<PartnerBatchSummary> {
  const existing = await repo.findById(batchId)
  if (!existing) throw new NotFoundError('Batch not found')
  await assertOrgOwnsListing(existing.listingId, organizationId)

  const seatsTotal = body.seatsTotal ?? existing.seatsTotal
  const seatsAvailable = body.seatsAvailable ?? existing.seatsAvailable
  assertSeats(seatsTotal, seatsAvailable)

  if (body.status === 'PUBLISHED') {
    const startDate = body.startDate ?? existing.startDate
    if (startDate.getTime() < Date.now()) {
      throw new ConflictError(
        'BATCH_START_DATE_PAST',
        'A batch starting in the past cannot be published',
      )
    }
    // BR-004 keeps partner content from reaching the public site around the
    // moderation gate.
    if (!(await isPublished(existing.listingId))) {
      throw new ConflictError(
        'BATCH_PARENT_NOT_PUBLISHED',
        'The parent listing must be PUBLISHED before a batch can be published',
      )
    }
  }

  const updated = await repo.update(batchId, {
    ...(body.title ? { title: body.title } : {}),
    ...(body.exam ? { exam: body.exam } : {}),
    ...(body.mode ? { mode: body.mode } : {}),
    ...(body.startDate ? { startDate: body.startDate } : {}),
    ...(body.endDate ? { endDate: body.endDate } : {}),
    ...(body.scheduleText ? { scheduleText: body.scheduleText } : {}),
    ...(body.seatsTotal === undefined ? {} : { seatsTotal: body.seatsTotal }),
    ...(body.seatsAvailable === undefined ? {} : { seatsAvailable: body.seatsAvailable }),
    ...(body.feeAmount === undefined ? {} : { feeAmount: body.feeAmount }),
    ...(body.status ? { status: body.status } : {}),
  })

  return toPartnerSummary(updated)
}
