import { Router } from 'express'
import { landingQuery, type LandingQuery } from '@one/shared'
import { validate, validated } from '../../middleware/validate.js'
import * as landing from './institutes.landing.service.js'

export const landingRouter = Router()

/// Feeds the sitemap. Declared before '/' for readability; the paths are
/// distinct, so order does not actually matter here.
landingRouter.get('/indexable', async (_req, res) => {
  res.json({ paths: await landing.indexablePaths() })
})

landingRouter.get('/', validate({ query: landingQuery }), async (req, res) => {
  const query = validated<LandingQuery>(req, 'query')
  res.json(await landing.landingPage(query))
})
