import { z } from 'zod'
import { MEDIA_LIMITS, mediaPurposeSchema } from '../media.js'

/// A logo or photo as partners and admins see it. `url` is the largest
/// variant; `thumbUrl` the 640 px one (null for a logo, which has one size).
export const mediaAsset = z.object({
  id: z.string(),
  purpose: mediaPurposeSchema,
  url: z.string(),
  thumbUrl: z.string().nullable(),
  alt: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  sortOrder: z.number().int(),
})
export type MediaAsset = z.infer<typeof mediaAsset>

/// The non-file fields of a multipart upload.
export const uploadMediaFields = z.object({
  purpose: mediaPurposeSchema,
  alt: z.string().trim().max(MEDIA_LIMITS.altMax).optional(),
})
export type UploadMediaFields = z.infer<typeof uploadMediaFields>

export const mediaIdParam = z.object({ assetId: z.string().min(1) })
export type MediaIdParam = z.infer<typeof mediaIdParam>

export const updateMediaBody = z.object({
  alt: z.string().trim().max(MEDIA_LIMITS.altMax).nullable(),
})
export type UpdateMediaBody = z.infer<typeof updateMediaBody>

/// Every photo of the listing exactly once, in the new order.
export const reorderMediaBody = z.object({
  assetIds: z.array(z.string().min(1)).min(1).max(MEDIA_LIMITS.photos),
})
export type ReorderMediaBody = z.infer<typeof reorderMediaBody>
