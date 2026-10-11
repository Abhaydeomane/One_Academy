import { z } from 'zod'
import { modeSchema } from './institutes.js'

// feeAmount is integer minor units (BR-005). A listing has a bounded number of
// batches, so this list is deliberately not paginated.
export const batchSummary = z.object({
  id: z.string(),
  title: z.string(),
  exam: z.string(),
  mode: modeSchema,
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime().nullable(),
  scheduleText: z.string().nullable(),
  seatsTotal: z.number().int(),
  seatsAvailable: z.number().int(),
  feeAmount: z.number().int(),
  feeCurrency: z.string(),
})
export type BatchSummary = z.infer<typeof batchSummary>

export const batchListResponse = z.object({ items: z.array(batchSummary) })
export type BatchListResponse = z.infer<typeof batchListResponse>
