import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'
import { modeSchema } from './institutes.js'
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
  /// True when publishing this listing will also verify its organisation (BR-013).
  newInstitute: z.boolean(),
  cityName: z.string(),
  address: z.string().nullable(),
  contactPhone: z.string().nullable(),
  website: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
})
export type AdminListingSummary = z.infer<typeof adminListingSummary>

export const adminListingDetail = adminListingSummary.extend({
  locality: z.string().nullable(),
  shortDescription: z.string().nullable(),
  about: z.string().nullable(),
  modes: z.array(modeSchema),
  exams: z.array(z.string()),
  batchCount: z.number().int(),
  rejectionReason: z.string().nullable(),
})
export type AdminListingDetail = z.infer<typeof adminListingDetail>

/// BR-014. Trimmed first, so padding cannot satisfy the minimum.
export const rejectListingBody = z.object({ reason: z.string().trim().min(10).max(500) })
export type RejectListingBody = z.infer<typeof rejectListingBody>

export const adminListingQueueResponse = paginated(adminListingSummary)
export type AdminListingQueueResponse = z.infer<typeof adminListingQueueResponse>
