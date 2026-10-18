import { z } from 'zod'
import { phoneSchema } from '../phone.js'

export const createEnquiryBody = z.object({
  listingSlug: z.string().min(1),
  batchId: z.string().min(1).optional(),
  name: z.string().min(2).max(120),
  phone: phoneSchema,
  email: z.email().optional(),
  message: z.string().max(1000).optional(),
})
export type CreateEnquiryBody = z.infer<typeof createEnquiryBody>

export const enquiryCreatedResponse = z.object({
  id: z.string(),
  status: z.literal('NEW'),
})
export type EnquiryCreatedResponse = z.infer<typeof enquiryCreatedResponse>
