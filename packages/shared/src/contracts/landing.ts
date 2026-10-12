import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'
import { instituteSummary, modeSchema } from './institutes.js'

/// Takes the raw path rather than exam/city/mode, so resolution happens once,
/// server-side, where the exam list lives. The alternative is the web app
/// trying each candidate reading in turn, which is two round trips to guess at
/// something the API can answer directly.
export const landingQuery = paginationQuery.extend({
  path: z.string().min(1).max(200),
})
export type LandingQuery = z.infer<typeof landingQuery>

export const landingExamSibling = z.object({
  slug: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  path: z.string(),
})

export const landingCitySibling = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
  path: z.string(),
})

export const landingModeSibling = z.object({
  mode: modeSchema,
  count: z.number().int().nonnegative(),
  path: z.string(),
})

export const landingPageResponse = z.object({
  exam: z.object({ slug: z.string(), label: z.string() }),
  city: z.object({ slug: z.string(), name: z.string(), state: z.string() }),
  mode: modeSchema.nullable(),
  listings: paginated(instituteSummary),
  /// The same query without the mode filter. Equal totals prove the sets are
  /// identical, which is what makes the canonical decision mechanical.
  parentTotal: z.number().int().nonnegative(),
  indexable: z.boolean(),
  canonicalPath: z.string(),
  /// Across the whole matching set, not the visible page.
  feeStats: z.object({
    minFeeAmount: z.number().int().nullable(),
    maxFeeAmount: z.number().int().nullable(),
  }),
  siblings: z.object({
    examsInCity: z.array(landingExamSibling),
    citiesForExam: z.array(landingCitySibling),
    modeVariants: z.array(landingModeSibling),
  }),
})
export type LandingPageResponse = z.infer<typeof landingPageResponse>

export const landingIndexableResponse = z.object({ paths: z.array(z.string()) })
export type LandingIndexableResponse = z.infer<typeof landingIndexableResponse>
