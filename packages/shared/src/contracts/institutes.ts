import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'

export const MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const
export const modeSchema = z.enum(MODES)
export type Mode = (typeof MODES)[number]

// `rating` was removed in P1a: nothing writes ratingAvg, so the option was
// inert. It returns with reviews (P1d).
export const SORT_OPTIONS = ['relevance', 'recent', 'fee_asc', 'name'] as const
export const sortSchema = z.enum(SORT_OPTIONS)
export type InstituteSort = (typeof SORT_OPTIONS)[number]

// A repeated query parameter arrives as a string when given once and an array
// when given more than once.
const toArray = (value: unknown) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value]

export const listInstitutesQuery = paginationQuery
  .extend({
    q: z.string().trim().max(100).optional(),
    city: z.string().min(1).optional(),
    exams: z.preprocess(toArray, z.array(z.string().min(1)).max(10).optional()),
    mode: modeSchema.optional(),
    // Fee bounds are integer minor units (paise), like every other amount.
    feeMin: z.coerce.number().int().min(0).optional(),
    feeMax: z.coerce.number().int().min(0).optional(),
    // Left undefined so the service can default to relevance when q is
    // present and recent when it is not.
    sort: sortSchema.optional(),
  })
  .refine(
    (value) =>
      value.feeMin === undefined || value.feeMax === undefined || value.feeMin <= value.feeMax,
    { error: 'feeMin must not exceed feeMax' },
  )

export type ListInstitutesQuery = z.infer<typeof listInstitutesQuery>

export const instituteSlugParam = z.object({ slug: z.string().min(1) })
export type InstituteSlugParam = z.infer<typeof instituteSlugParam>

/// Named minFeeAmount rather than feeMin so a response field can never be
/// confused with the request filter for the same concept.
export const instituteSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.object({ slug: z.string(), name: z.string() }),
  locality: z.string().nullable(),
  shortDescription: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  modes: z.array(modeSchema),
  exams: z.array(z.string()),
  batchCount: z.number().int(),
  minFeeAmount: z.number().int().nullable(),
  maxFeeAmount: z.number().int().nullable(),
})
export type InstituteSummary = z.infer<typeof instituteSummary>

export const facetCounts = z.object({
  exams: z.array(
    z.object({ slug: z.string(), label: z.string(), count: z.number().int().nonnegative() }),
  ),
  modes: z.array(z.object({ mode: modeSchema, count: z.number().int().nonnegative() })),
})
export type FacetCounts = z.infer<typeof facetCounts>

export const instituteListResponse = paginated(instituteSummary).extend({
  facets: facetCounts,
})
export type InstituteListResponse = z.infer<typeof instituteListResponse>

export const instituteDetail = instituteSummary.extend({
  about: z.string().nullable(),
  website: z.string().nullable(),
  establishedYear: z.number().int().nullable(),
  facultyCount: z.number().int().nullable(),
  media: z.array(z.object({ url: z.string(), alt: z.string().nullable() })),
  publishedAt: z.iso.datetime().nullable(),
})
export type InstituteDetail = z.infer<typeof instituteDetail>

/// Preset fee bands, in paise. Buckets rather than a dual-handle slider:
/// sliders are unusable with a thumb, and these fit the existing chip rail.
/// The boundaries are a first guess at the Indian coaching market and should
/// be revisited against real fee data.
export const FEE_BUCKETS = [
  { id: 'under-25k', label: 'Under ₹25,000', feeMax: 2_500_000 },
  { id: '25k-50k', label: '₹25,000 – ₹50,000', feeMin: 2_500_000, feeMax: 5_000_000 },
  { id: '50k-1l', label: '₹50,000 – ₹1,00,000', feeMin: 5_000_000, feeMax: 10_000_000 },
  { id: 'over-1l', label: 'Over ₹1,00,000', feeMin: 10_000_000 },
] as const satisfies readonly {
  id: string
  label: string
  feeMin?: number
  feeMax?: number
}[]

export type FeeBucketId = (typeof FEE_BUCKETS)[number]['id']
