import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'
import { listingStatusSchema } from './partner.js'

export const adminListingQueueQuery = paginationQuery.extend({
  status: listingStatusSchema.default('PENDING_REVIEW'),
})
export type AdminListingQueueQuery = z.infer<typeof adminListingQueueQuery>

export const adminListingSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: listingStatusSchema,
  organizationName: z.string(),
  cityName: z.string(),
  updatedAt: z.iso.datetime(),
})
export type AdminListingSummary = z.infer<typeof adminListingSummary>

export const adminListingQueueResponse = paginated(adminListingSummary)
export type AdminListingQueueResponse = z.infer<typeof adminListingQueueResponse>
