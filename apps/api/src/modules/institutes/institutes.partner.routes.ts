import { Router } from 'express'
import {
  createBatchBody,
  createListingBody,
  listingIdParam,
  updateListingBody,
  type CreateBatchBody,
  type CreateListingBody,
  type ListingIdParam,
  type UpdateListingBody,
} from '@one/shared'
import { currentOrgId, requireAuth, requireOrg } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as institutes from './institutes.service.js'

export const partnerInstitutesRouter = Router()

partnerInstitutesRouter.use(requireAuth, requireOrg)

partnerInstitutesRouter.get('/', async (req, res) => {
  const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
  res.json(await institutes.listForOrg(organizationId))
})

partnerInstitutesRouter.post('/', validate({ body: createListingBody }), async (req, res) => {
  const body = validated<CreateListingBody>(req, 'body')
  const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
  res.status(201).json(await institutes.createForOrg(organizationId, body))
})

partnerInstitutesRouter.get(
  '/:listingId',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
    res.json(await institutes.getForOrg(listingId, organizationId))
  },
)

partnerInstitutesRouter.patch(
  '/:listingId',
  validate({ params: listingIdParam, body: updateListingBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const body = validated<UpdateListingBody>(req, 'body')
    const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
    res.json(await institutes.updateForOrg(listingId, organizationId, body))
  },
)

partnerInstitutesRouter.post(
  '/:listingId/batches',
  validate({ params: listingIdParam, body: createBatchBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const body = validated<CreateBatchBody>(req, 'body')
    const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
    res.status(201).json(await institutes.createBatchForOrg(listingId, organizationId, body))
  },
)

partnerInstitutesRouter.post(
  '/:listingId/submit',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
    res.json(await institutes.submitForReviewForOrg(listingId, organizationId))
  },
)

/// Mounted at /api/v1/partner/reference. It lives in this module because
/// cities and exam tags are institute reference data.
export const partnerReferenceRouter = Router()
partnerReferenceRouter.use(requireAuth, requireOrg)
partnerReferenceRouter.get('/', async (_req, res) => {
  res.json(await institutes.referenceData())
})
