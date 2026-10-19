import { Router } from 'express'
import type { z } from 'zod'
import { listingIdParam, mediaIdParam } from '@one/shared'
import { requireAdmin, requireAuth } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as media from './media.service.js'

const params = listingIdParam.extend(mediaIdParam.shape)
type Params = z.infer<typeof params>

/// Mounted at /api/v1/admin/listings, after the listings admin router.
export const adminMediaRouter = Router()

adminMediaRouter.use(requireAuth, requireAdmin)

adminMediaRouter.delete('/:listingId/media/:assetId', validate({ params }), async (req, res) => {
  const { listingId, assetId } = validated<Params>(req, 'params')
  res.json(await media.deleteAsAdmin(listingId, assetId))
})
