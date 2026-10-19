import { z } from 'zod'

/// BR-020 and the upload bounds (spec §4). One definition for the API, the
/// partner UI's copy and its client-side checks.
export const MEDIA_LIMITS = {
  logos: 1,
  photos: 10,
  maxBytes: 8 * 1024 * 1024,
  maxPixels: 40_000_000,
  altMax: 120,
} as const

export const MEDIA_PURPOSES = ['LOGO', 'PHOTO'] as const
export const mediaPurposeSchema = z.enum(MEDIA_PURPOSES)
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>
