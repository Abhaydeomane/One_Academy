import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'

export const MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const
export const modeSchema = z.enum(MODES)
export type Mode = (typeof MODES)[number]

export const listInstitutesQuery = paginationQuery.extend({
  city: z.string().min(1).optional(),
  exam: z.string().min(1).optional(),
  mode: modeSchema.optional(),
  sort: z.enum(['recent', 'rating', 'name']).default('recent'),
})
export type ListInstitutesQuery = z.infer<typeof listInstitutesQuery>

export const instituteSlugParam = z.object({ slug: z.string().min(1) })
export type InstituteSlugParam = z.infer<typeof instituteSlugParam>

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
})
export type InstituteSummary = z.infer<typeof instituteSummary>

export const instituteListResponse = paginated(instituteSummary)
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
