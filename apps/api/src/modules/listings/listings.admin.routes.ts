import { Router } from 'express'
import {
  adminListingQueueQuery,
  listingIdParam,
  rejectListingBody,
  suspendListingBody,
  type AdminListingQueueQuery,
  type ListingIdParam,
  type RejectListingBody,
  type SuspendListingBody,
} from '@one/shared'
import { currentAuth, requireAdmin, requireAuth } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as listings from './listings.service.js'

export const adminListingsRouter = Router()

// BR-001: the whole router is admin-only.
adminListingsRouter.use(requireAuth, requireAdmin)

adminListingsRouter.get('/', validate({ query: adminListingQueueQuery }), async (req, res) => {
  const query = validated<AdminListingQueueQuery>(req, 'query')
  res.json(await listings.listForModeration(query))
})

adminListingsRouter.get('/:listingId', validate({ params: listingIdParam }), async (req, res) => {
  const { listingId } = validated<ListingIdParam>(req, 'params')
  res.json(await listings.getForModeration(listingId))
})

adminListingsRouter.post(
  '/:listingId/publish',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    res.json(await listings.publishAsAdmin(listingId, currentAuth(req).userId))
  },
)

adminListingsRouter.post(
  '/:listingId/reject',
  validate({ params: listingIdParam, body: rejectListingBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const { reason } = validated<RejectListingBody>(req, 'body')
    res.json(await listings.rejectAsAdmin(listingId, reason))
  },
)

adminListingsRouter.post(
  '/:listingId/suspend',
  validate({ params: listingIdParam, body: suspendListingBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const { reason } = validated<SuspendListingBody>(req, 'body')
    res.json(await listings.suspendAsAdmin(listingId, reason, currentAuth(req).userId))
  },
)

adminListingsRouter.post(
  '/:listingId/reinstate',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    res.json(await listings.reinstateAsAdmin(listingId))
  },
)
