import { Router } from 'express'
import { compareQuery, type CompareQuery } from '@one/shared'
import { validate, validated } from '../../middleware/validate.js'
import * as compare from './institutes.compare.service.js'

export const compareRouter = Router()

/// Mounted at /api/v1/compare rather than under /api/v1/institutes, where
/// institutesRouter's GET /:slug would shadow it the moment a listing is
/// slugged "compare". ADR 0004 governs where the code lives, not the URL.
compareRouter.get('/', validate({ query: compareQuery }), async (req, res) => {
  res.json(await compare.compare(validated<CompareQuery>(req, 'query')))
})
