import type { CreateEnquiryBody } from '@one/shared'
import { BadRequestError } from '../../lib/errors.js'
import * as batches from '../batches/batches.service.js'
import { resolvePublishedSlug } from '../listings/listings.service.js'
import * as repo from './enquiries.repository.js'

export type { EnquiryRow } from './enquiries.repository.js'

export async function create(body: CreateEnquiryBody) {
  // Resolving through the published-slug path means an enquiry cannot be
  // attached to a draft listing (BR-009).
  const { listingId } = await resolvePublishedSlug(body.listingSlug)

  if (body.batchId) {
    const belongs = await batches.belongsToListing(body.batchId, listingId)
    if (!belongs) throw new BadRequestError('batchId does not belong to this listing')
  }

  const created = await repo.create({
    listingId,
    vertical: 'INSTITUTE',
    ...(body.batchId ? { batchId: body.batchId } : {}),
    name: body.name,
    phone: body.phone,
    ...(body.email ? { email: body.email } : {}),
    ...(body.message ? { message: body.message } : {}),
  })

  return { id: created.id, status: 'NEW' as const }
}

/// BR-007: only reachable from organisation-scoped routes. P0 exposes no read
/// endpoint; the partner lead inbox arrives in P2.
export async function listForListing(listingId: string) {
  return repo.listByListing(listingId)
}
