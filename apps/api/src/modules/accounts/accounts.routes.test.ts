import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Webhook } from 'svix'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

function signed(body: unknown) {
  const payload = JSON.stringify(body)
  const id = 'msg_test_1'
  const timestamp = new Date()
  const signature = new Webhook(SECRET).sign(id, timestamp, payload)

  return {
    payload,
    headers: {
      'svix-id': id,
      'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'svix-signature': signature,
      'content-type': 'application/json',
    },
  }
}

const orgEvent = {
  type: 'organization.created',
  data: { id: 'co_hook', name: 'Hooked Org', slug: 'hooked-org' },
}

describe('POST /api/v1/webhooks/clerk', () => {
  it('rejects a request with no signature headers', async () => {
    const res = await testApp()
      .post('/api/v1/webhooks/clerk')
      .set('content-type', 'application/json')
      .send(JSON.stringify(orgEvent))

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(await prisma.organization.count()).toBe(0)
  })

  it('rejects a tampered payload that no longer matches its signature', async () => {
    const { headers } = signed(orgEvent)
    const tampered = JSON.stringify({
      type: 'organization.created',
      data: { id: 'co_evil', name: 'Evil Org', slug: 'evil-org' },
    })

    const res = await testApp().post('/api/v1/webhooks/clerk').set(headers).send(tampered)

    expect(res.status).toBe(401)
    expect(await prisma.organization.count()).toBe(0)
  })

  it('accepts a correctly signed organisation event and mirrors it', async () => {
    const { payload, headers } = signed(orgEvent)

    const res = await testApp().post('/api/v1/webhooks/clerk').set(headers).send(payload)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ received: true })

    const org = await prisma.organization.findUniqueOrThrow({ where: { clerkOrgId: 'co_hook' } })
    expect(org.slug).toBe('hooked-org')
  })

  it('mirrors a signed user event', async () => {
    const { payload, headers } = signed({
      type: 'user.created',
      data: {
        id: 'cu_hook',
        first_name: 'Asha',
        email_addresses: [{ email_address: 'asha@test.local' }],
      },
    })

    const res = await testApp().post('/api/v1/webhooks/clerk').set(headers).send(payload)

    expect(res.status).toBe(200)
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: 'cu_hook' } })
    expect(user.email).toBe('asha@test.local')
    expect(user.globalRole).toBe('USER')
  })

  it('acknowledges a signed but unrecognised event without writing anything', async () => {
    const { payload, headers } = signed({ type: 'session.ended', data: { id: 'sess_1' } })

    const res = await testApp().post('/api/v1/webhooks/clerk').set(headers).send(payload)

    expect(res.status).toBe(200)
    expect(await prisma.organization.count()).toBe(0)
    expect(await prisma.user.count()).toBe(0)
  })
})
