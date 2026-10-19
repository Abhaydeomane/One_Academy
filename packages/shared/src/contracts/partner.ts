import { z } from 'zod'
import { phoneSchema } from '../phone.js'
import { modeSchema } from './institutes.js'
import { batchSummary } from './batches.js'
import { mediaAsset } from './media.js'

export const LISTING_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED'] as const
export const listingStatusSchema = z.enum(LISTING_STATUSES)
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const BATCH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export const batchStatusSchema = z.enum(BATCH_STATUSES)
export type BatchStatus = (typeof BATCH_STATUSES)[number]

export const listingIdParam = z.object({ listingId: z.string().min(1) })
export type ListingIdParam = z.infer<typeof listingIdParam>

export const batchIdParam = z.object({ batchId: z.string().min(1) })
export type BatchIdParam = z.infer<typeof batchIdParam>

export const partnerListingSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: listingStatusSchema,
  cityName: z.string(),
  batchCount: z.number().int(),
  rejectionReason: z.string().nullable(),
  suspensionReason: z.string().nullable(),
  updatedAt: z.iso.datetime(),
})
export type PartnerListingSummary = z.infer<typeof partnerListingSummary>

export const partnerListingListResponse = z.object({
  items: z.array(partnerListingSummary),
})
export type PartnerListingListResponse = z.infer<typeof partnerListingListResponse>

export const partnerBatchSummary = batchSummary.extend({ status: batchStatusSchema })
export type PartnerBatchSummary = z.infer<typeof partnerBatchSummary>

export const partnerListingDetail = partnerListingSummary.extend({
  citySlug: z.string(),
  locality: z.string().nullable(),
  address: z.string().nullable(),
  /// Private (spec §4): partner and admin contracts only.
  contactPhone: z.string().nullable(),
  exams: z.array(z.string()),
  shortDescription: z.string().nullable(),
  about: z.string().nullable(),
  website: z.string().nullable(),
  /// Null until first publication; afterwards the city is fixed (BR-002).
  firstPublishedAt: z.iso.datetime().nullable(),
  /// Logo first, then photos in display order.
  media: z.array(mediaAsset),
  batches: z.array(partnerBatchSummary),
})
export type PartnerListingDetail = z.infer<typeof partnerListingDetail>

export const updateListingBody = z
  .object({
    name: z.string().min(2).max(200).optional(),
    shortDescription: z.string().max(500).optional(),
    locality: z.string().max(200).optional(),
    about: z.string().max(5000).optional(),
    website: z.url({ protocol: /^https?$/ }).optional(),
    establishedYear: z.number().int().min(1900).max(2100).optional(),
    facultyCount: z.number().int().min(0).max(10000).optional(),
    modes: z.array(modeSchema).min(1).optional(),
    address: z.string().trim().min(5).max(300).optional(),
    contactPhone: phoneSchema.optional(),
    examSlugs: z.array(z.string().min(1)).min(1).max(20).optional(),
    citySlug: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'At least one field must be provided',
  })
export type UpdateListingBody = z.infer<typeof updateListingBody>

// feeAmount is minor units and therefore an integer (BR-005). The partner UI
// collects rupees and converts before calling.
export const createBatchBody = z.object({
  title: z.string().min(2).max(200),
  exam: z.string().min(1).max(60),
  mode: modeSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  scheduleText: z.string().max(300).optional(),
  seatsTotal: z.number().int().min(1).max(10000),
  seatsAvailable: z.number().int().min(0).max(10000).optional(),
  feeAmount: z.number().int().min(0),
  feeCurrency: z.string().length(3).default('INR'),
})
export type CreateBatchBody = z.infer<typeof createBatchBody>

export const updateBatchBody = z
  .object({
    title: z.string().min(2).max(200).optional(),
    exam: z.string().min(1).max(60).optional(),
    mode: modeSchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    scheduleText: z.string().max(300).optional(),
    seatsTotal: z.number().int().min(1).max(10000).optional(),
    seatsAvailable: z.number().int().min(0).max(10000).optional(),
    feeAmount: z.number().int().min(0).optional(),
    status: batchStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'At least one field must be provided',
  })
export type UpdateBatchBody = z.infer<typeof updateBatchBody>

export const partnerReferenceResponse = z.object({
  cities: z.array(z.object({ slug: z.string(), name: z.string(), state: z.string() })),
  exams: z.array(z.object({ slug: z.string(), label: z.string() })),
})
export type PartnerReferenceResponse = z.infer<typeof partnerReferenceResponse>

/// BR-011: no status and no organisation. Unknown keys are stripped, so a
/// client that sends them changes nothing; the organisation comes from the session.
export const createListingBody = z.object({
  name: z.string().trim().min(2).max(200),
  citySlug: z.string().min(1),
})
export type CreateListingBody = z.infer<typeof createListingBody>
