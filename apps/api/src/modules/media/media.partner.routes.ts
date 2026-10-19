import { Router } from 'express'
import {
  listingIdParam,
  mediaIdParam,
  reorderMediaBody,
  updateMediaBody,
  uploadMediaFields,
  type ListingIdParam,
  type MediaIdParam,
  type ReorderMediaBody,
  type UpdateMediaBody,
  type UploadMediaFields,
} from '@one/shared'
import { currentOrgId, requireAuth, requireOrg } from '../../middleware/auth.js'
import { uploadSingleImage } from '../../middleware/upload.js'
import { validate, validated } from '../../middleware/validate.js'
import * as media from './media.service.js'

/// Mounted at /api/v1/partner: media spans listing-scoped and asset-scoped paths.
export const partnerMediaRouter = Router()

partnerMediaRouter.use(requireAuth, requireOrg)

partnerMediaRouter.post(
  '/listings/:listingId/media',
  uploadSingleImage,
  validate({ params: listingIdParam, body: uploadMediaFields }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const { purpose, alt } = validated<UploadMediaFields>(req, 'body')
    const organizationId = await media.resolveOrganizationId(currentOrgId(req))
    res.status(201).json(
      await media.uploadForOrg(listingId, organizationId, {
        // uploadSingleImage guarantees the file.
        buffer: req.file!.buffer,
        purpose,
        ...(alt === undefined ? {} : { alt }),
      }),
    )
  },
)

partnerMediaRouter.patch(
  '/media/:assetId',
  validate({ params: mediaIdParam, body: updateMediaBody }),
  async (req, res) => {
    const { assetId } = validated<MediaIdParam>(req, 'params')
    const { alt } = validated<UpdateMediaBody>(req, 'body')
    const organizationId = await media.resolveOrganizationId(currentOrgId(req))
    res.json(await media.updateAltForOrg(assetId, organizationId, alt))
  },
)

partnerMediaRouter.put(
  '/listings/:listingId/media/order',
  validate({ params: listingIdParam, body: reorderMediaBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const { assetIds } = validated<ReorderMediaBody>(req, 'body')
    const organizationId = await media.resolveOrganizationId(currentOrgId(req))
    res.json(await media.reorderForOrg(listingId, organizationId, assetIds))
  },
)

partnerMediaRouter.delete(
  '/media/:assetId',
  validate({ params: mediaIdParam }),
  async (req, res) => {
    const { assetId } = validated<MediaIdParam>(req, 'params')
    const organizationId = await media.resolveOrganizationId(currentOrgId(req))
    await media.deleteForOrg(assetId, organizationId)
    res.status(204).end()
  },
)
