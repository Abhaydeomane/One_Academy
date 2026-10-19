import { z } from 'zod'
import { COMPARE_MAX, COMPARE_MIN, dedupeSlugs } from '../compare.js'
import { batchSummary } from './batches.js'

// A repeated query parameter arrives as a string when given once and an array
// when given more than once — the same shape `exams` handles in institutes.ts.
const toArray = (value: unknown) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value]

export const compareQuery = z.object({
  // De-duplicated inside the transform so the BR-008 count is checked against
  // distinct institutes: a doubled value must not consume a slot.
  slug: z
    .preprocess(toArray, z.array(z.string().min(1)))
    .transform(dedupeSlugs)
    .refine((slugs) => slugs.length >= COMPARE_MIN && slugs.length <= COMPARE_MAX, {
      error: `Compare requires between ${COMPARE_MIN} and ${COMPARE_MAX} institutes`,
    }),
  batch: z.preprocess(toArray, z.array(z.string().min(1)).max(COMPARE_MAX).optional()),
})
export type CompareQuery = z.infer<typeof compareQuery>

export const compareColumn = z.object({
  institute: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    city: z.object({ slug: z.string(), name: z.string() }),
    locality: z.string().nullable(),
    establishedYear: z.number().int().nullable(),
    facultyCount: z.number().int().nullable(),
    // Upcoming only, unlike the search card's count. See BUG-002.
    batchCount: z.number().int().nonnegative(),
    logoUrl: z.string().nullable(),
  }),
  /// Null when the institute has no upcoming published batch. The column still
  /// renders: the institute rows are still worth comparing.
  pinned: batchSummary.nullable(),
  /// True when the requested pin no longer qualified and the default was used.
  /// Rot, not an error — the expected fate of a shared link.
  pinFellBack: z.boolean(),
  batches: z.array(batchSummary),
})
export type CompareColumn = z.infer<typeof compareColumn>

export const compareResponse = z.object({
  columns: z.array(compareColumn),
  /// Requested slugs that could not be shown. Returned rather than silently
  /// omitted so the UI can say what happened to a link the student was sent,
  /// instead of diffing the request against the response to find out.
  dropped: z.array(z.object({ slug: z.string(), reason: z.enum(['NOT_FOUND', 'UNPUBLISHED']) })),
  /// Former names resolved to canonical ones, in request order. The page
  /// redirects when this differs from what was asked for; the API deliberately
  /// does not 301, because fetch would consume it (BUG-001).
  canonicalSlugs: z.array(z.string()),
})
export type CompareResponse = z.infer<typeof compareResponse>
