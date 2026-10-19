import { clerkMiddleware } from '@clerk/express'
import express, { type Express } from 'express'
import { config } from './config/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestId } from './middleware/requestId.js'
import { accountsRouter } from './modules/accounts/accounts.routes.js'
import { partnerBatchesRouter } from './modules/batches/batches.partner.routes.js'
import { enquiriesRouter } from './modules/enquiries/enquiries.routes.js'
import { compareRouter } from './modules/institutes/institutes.compare.routes.js'
import { landingRouter } from './modules/institutes/institutes.landing.routes.js'
import {
  partnerInstitutesRouter,
  partnerReferenceRouter,
} from './modules/institutes/institutes.partner.routes.js'
import { institutesRouter } from './modules/institutes/institutes.routes.js'
import { adminListingsRouter } from './modules/listings/listings.admin.routes.js'

// Assembly only. Business logic belongs in a module service.
export function createServer(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(requestId)

  // Webhooks are mounted before the JSON parser: signature verification needs
  // the raw bytes that were signed.
  app.use('/api/v1/webhooks', accountsRouter)

  app.use(express.json({ limit: '1mb' }))

  if (config.clerkSecretKey) app.use(clerkMiddleware())

  app.use((req, res, next) => {
    const origin = req.get('origin')
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-headers', 'content-type,authorization')
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS')
      res.setHeader('vary', 'origin')
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  // Local media (STORAGE_DRIVER=fs). Keys are never reused, so cache forever.
  if (config.storage.driver === 'fs') {
    app.use(
      '/media',
      express.static(config.storage.fsRoot, {
        immutable: true,
        maxAge: '1y',
        fallthrough: false,
        dotfiles: 'deny',
      }),
    )
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/v1/institutes', institutesRouter)
  app.use('/api/v1/landing', landingRouter)
  app.use('/api/v1/compare', compareRouter)
  app.use('/api/v1/enquiries', enquiriesRouter)
  app.use('/api/v1/partner/listings', partnerInstitutesRouter)
  app.use('/api/v1/partner/reference', partnerReferenceRouter)
  app.use('/api/v1/partner/batches', partnerBatchesRouter)
  app.use('/api/v1/admin/listings', adminListingsRouter)

  app.use(errorHandler)
  return app
}
