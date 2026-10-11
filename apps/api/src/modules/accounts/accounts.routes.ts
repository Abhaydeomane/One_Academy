import { raw, Router } from 'express'
import { Webhook } from 'svix'
import { z } from 'zod'
import { config } from '../../config/index.js'
import { AppError, UnauthenticatedError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import * as accounts from './accounts.service.js'

const eventSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
})

const emailSchema = z.array(z.object({ email_address: z.string() })).min(1)

export const accountsRouter = Router()

// Mounted before express.json() because signature verification must run over
// the exact bytes Clerk signed.
accountsRouter.post('/clerk', raw({ type: 'application/json' }), async (req, res) => {
  if (!config.clerkWebhookSecret) {
    // Unconfigured rather than broken: refuse to act instead of trusting input.
    throw new AppError('INTERNAL', 503, 'Clerk webhook is not configured')
  }

  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''

  // svix 2.x `verify` validates and throws; it does not return the payload, so
  // parsing is a separate step.
  let event: unknown
  try {
    new Webhook(config.clerkWebhookSecret).verify(payload, {
      'svix-id': req.get('svix-id') ?? '',
      'svix-timestamp': req.get('svix-timestamp') ?? '',
      'svix-signature': req.get('svix-signature') ?? '',
    })
    event = JSON.parse(payload)
  } catch {
    logger.warn({ requestId: req.id }, 'Rejected Clerk webhook with an invalid signature')
    throw new UnauthenticatedError('Invalid webhook signature')
  }

  const parsed = eventSchema.safeParse(event)
  if (!parsed.success) {
    // A verified payload we do not recognise is acknowledged, not retried.
    logger.warn({ requestId: req.id }, 'Unrecognised Clerk webhook payload')
    res.json({ received: true })
    return
  }

  const { type, data } = parsed.data

  if (type === 'user.created' || type === 'user.updated') {
    const emails = emailSchema.safeParse(data.email_addresses)
    if (emails.success && emails.data[0]) {
      await accounts.syncUser({
        clerkUserId: String(data.id),
        email: emails.data[0].email_address,
        ...(typeof data.first_name === 'string' ? { name: data.first_name } : {}),
      })
    }
  }

  if (type === 'organization.created' || type === 'organization.updated') {
    await accounts.syncOrganization({
      clerkOrgId: String(data.id),
      name: String(data.name),
      slug: String(data.slug ?? data.id),
    })
  }

  logger.info({ requestId: req.id, type }, 'Clerk webhook processed')
  res.json({ received: true })
})
