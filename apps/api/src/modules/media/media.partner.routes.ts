import { Router } from 'express'
import {
  listingIdParam,
  uploadMediaFields,
  type ListingIdParam,
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
