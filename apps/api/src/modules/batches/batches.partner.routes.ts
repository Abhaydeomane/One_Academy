import { Router } from 'express'
import { batchIdParam, updateBatchBody, type BatchIdParam, type UpdateBatchBody } from '@one/shared'
import { currentOrgId, requireAuth, requireOrg } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as batches from './batches.service.js'

export const partnerBatchesRouter = Router()

partnerBatchesRouter.use(requireAuth, requireOrg)

partnerBatchesRouter.patch(
  '/:batchId',
  validate({ params: batchIdParam, body: updateBatchBody }),
  async (req, res) => {
    const { batchId } = validated<BatchIdParam>(req, 'params')
    const body = validated<UpdateBatchBody>(req, 'body')
    const organizationId = await batches.resolveOrganizationId(currentOrgId(req))
    res.json(await batches.updateForOrg(batchId, organizationId, body))
  },
)
