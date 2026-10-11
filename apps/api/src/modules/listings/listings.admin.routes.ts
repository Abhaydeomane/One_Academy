import { Router } from 'express'
import {
  adminListingQueueQuery,
  listingIdParam,
  type AdminListingQueueQuery,
  type ListingIdParam,
} from '@one/shared'
import { requireAdmin, requireAuth } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as listings from './listings.service.js'

export const adminListingsRouter = Router()

// BR-001: the whole router is admin-only.
adminListingsRouter.use(requireAuth, requireAdmin)

adminListingsRouter.get('/', validate({ query: adminListingQueueQuery }), async (req, res) => {
  const query = validated<AdminListingQueueQuery>(req, 'query')
  res.json(await listings.listForModeration(query))
})

adminListingsRouter.post(
  '/:listingId/publish',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    res.json(await listings.publishAsAdmin(listingId))
  },
)
