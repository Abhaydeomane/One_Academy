import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { createEnquiryBody, type CreateEnquiryBody, type ErrorEnvelope } from '@one/shared'
import { config } from '../../config/index.js'
import { validate, validated } from '../../middleware/validate.js'
import * as enquiries from './enquiries.service.js'

// 10 per hour per IP in production. Raised under test so repeated suite runs
// are not throttled.
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 10000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ErrorEnvelope = {
      error: { code: 'RATE_LIMITED', message: 'Too many enquiries. Please try again later.' },
    }
    res.status(429).json(body)
  },
})

export const enquiriesRouter = Router()

enquiriesRouter.post('/', limiter, validate({ body: createEnquiryBody }), async (req, res) => {
  const body = validated<CreateEnquiryBody>(req, 'body')
  res.status(201).json(await enquiries.create(body))
})
