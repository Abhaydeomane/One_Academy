import { z } from 'zod'

// Every error the API can return. Frontends map these codes to copy, so adding
// a code is a contract change: add it here, not as a bare string.
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  'LISTING_NOT_PUBLISHED',
  'SLUG_IMMUTABLE',
  'BATCH_START_DATE_PAST',
  'BATCH_PARENT_NOT_PUBLISHED',
  'SEATS_OUT_OF_RANGE',
  'INVALID_STATUS_TRANSITION',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const errorEnvelope = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type ErrorEnvelope = z.infer<typeof errorEnvelope>
