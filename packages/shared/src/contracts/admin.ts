import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'
import { modeSchema } from './institutes.js'
import { listingStatusSchema } from './partner.js'
import { listingChangeSchema } from '../watched.js'

export const adminListingQueueQuery = paginationQuery.extend({
  status: listingStatusSchema.default('PENDING_REVIEW'),
  /// Published listings with unreviewed changes (BR-018); overrides status.
  changed: z.stringbool().optional(),
  /// Name or slug, case-insensitive.
  q: z.string().trim().min(1).max(100).optional(),
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
  suspensionReason: z.string().nullable(),
  /// In review, and was public before: a suspended institute asking to return.
  resubmittedAfterSuspension: z.boolean(),
  changedSinceReviewAt: z.iso.datetime().nullable(),
  changedFieldCount: z.number().int(),
})
export type AdminListingSummary = z.infer<typeof adminListingSummary>

/// Publish, suspend and reinstate change what the public sees. False means the
/// web app's cache could not be cleared, so the change may take up to the
/// 300-second TTL to show.
export const adminDecisionResponse = adminListingSummary.extend({
  publicCacheCleared: z.boolean(),
})
export type AdminDecisionResponse = z.infer<typeof adminDecisionResponse>

export const adminListingDetail = adminListingSummary.extend({
  locality: z.string().nullable(),
  shortDescription: z.string().nullable(),
  about: z.string().nullable(),
  modes: z.array(modeSchema),
  exams: z.array(z.string()),
  batchCount: z.number().int(),
  rejectionReason: z.string().nullable(),
  suspendedAt: z.iso.datetime().nullable(),
  firstPublishedAt: z.iso.datetime().nullable(),
  /// Watched fields that differ from the approved snapshot, before → after.
  changes: z.array(listingChangeSchema),
})
export type AdminListingDetail = z.infer<typeof adminListingDetail>

/// BR-014. Trimmed first, so padding cannot satisfy the minimum.
export const rejectListingBody = z.object({ reason: z.string().trim().min(10).max(500) })
export type RejectListingBody = z.infer<typeof rejectListingBody>

/// BR-015. The institute sees the reason, so it gets the same bounds as a rejection.
export const suspendListingBody = z.object({ reason: z.string().trim().min(10).max(500) })
export type SuspendListingBody = z.infer<typeof suspendListingBody>

/// BR-018. The changedSinceReviewAt the admin saw; stale if the partner has
/// edited since.
export const markReviewedBody = z.object({ changedSinceReviewAt: z.iso.datetime() })
export type MarkReviewedBody = z.infer<typeof markReviewedBody>

export const adminListingQueueResponse = paginated(adminListingSummary)
export type AdminListingQueueResponse = z.infer<typeof adminListingQueueResponse>
