import express, { type Express } from 'express'
import { config } from './config/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestId } from './middleware/requestId.js'

// Assembly only. Business logic belongs in a module service.
export function createServer(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(requestId)

  app.use(express.json({ limit: '1mb' }))

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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Routers are mounted here as modules are added.

  app.use(errorHandler)
  return app
}
