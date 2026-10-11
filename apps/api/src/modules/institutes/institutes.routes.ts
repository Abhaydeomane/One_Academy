import { Router } from 'express'
import {
  instituteSlugParam,
  listInstitutesQuery,
  type InstituteSlugParam,
  type ListInstitutesQuery,
} from '@one/shared'
import { validate, validated } from '../../middleware/validate.js'
import * as institutes from './institutes.service.js'

export const institutesRouter = Router()

institutesRouter.get('/', validate({ query: listInstitutesQuery }), async (req, res) => {
  const query = validated<ListInstitutesQuery>(req, 'query')
  res.json(await institutes.listPublished(query))
})

institutesRouter.get('/:slug', validate({ params: instituteSlugParam }), async (req, res) => {
  const { slug } = validated<InstituteSlugParam>(req, 'params')
  const result = await institutes.getPublishedBySlug(slug)

  // BR-002: an old slug redirects permanently to the canonical one.
  if (result.redirected) {
    res.redirect(301, `/api/v1/institutes/${result.canonicalSlug}`)
    return
  }

  res.json(result.detail)
})

institutesRouter.get(
  '/:slug/batches',
  validate({ params: instituteSlugParam }),
  async (req, res) => {
    const { slug } = validated<InstituteSlugParam>(req, 'params')
    res.json({ items: await institutes.listPublishedBatchesBySlug(slug) })
  },
)
