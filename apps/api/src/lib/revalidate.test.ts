import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { revalidatePublicPages } from './revalidate.js'

const SECRET = 'a-test-secret-that-is-at-least-32-chars'

let server: Server | undefined

afterEach(async () => {
  server?.closeAllConnections()
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined))
  server = undefined
})

/// A real HTTP server standing in for the web app; `respond` decides the reply.
async function listen(
  respond: (headers: IncomingHttpHeaders, reply: (status: number) => void) => void,
): Promise<string> {
  server = createServer((req, res) => respond(req.headers, (status) => res.writeHead(status).end()))
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/revalidate`
}

describe('revalidatePublicPages', () => {
  it('returns false without calling anything when unconfigured', async () => {
    // The test environment sets neither WEB_REVALIDATE_URL nor REVALIDATE_SECRET.
    expect(await revalidatePublicPages()).toBe(false)
  })

  it('posts the secret header and returns true on 200', async () => {
    let received: string | string[] | undefined
    const url = await listen((headers, reply) => {
      received = headers['x-revalidate-secret']
      reply(200)
    })
    expect(await revalidatePublicPages({ url, secret: SECRET })).toBe(true)
    expect(received).toBe(SECRET)
  })

  it('returns false on a 401', async () => {
    const url = await listen((_headers, reply) => reply(401))
    expect(await revalidatePublicPages({ url, secret: SECRET })).toBe(false)
  })

  it('returns false within the timeout when the server never answers', async () => {
    const url = await listen(() => {})
    const started = Date.now()
    expect(await revalidatePublicPages({ url, secret: SECRET })).toBe(false)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('reports false when the web app is unreachable', async () => {
    expect(await revalidatePublicPages({ url: 'http://127.0.0.1:9/', secret: SECRET })).toBe(false)
  })
})
