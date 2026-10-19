import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidateTag } from 'next/cache'
import { POST } from './route'

// next/cache only works inside a running Next server; this test is about who
// may trigger it, so the call itself is replaced.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const SECRET = 'a-test-secret-that-is-at-least-32-chars'

const request = (secret?: string) =>
  new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-revalidate-secret': secret },
  })

beforeEach(() => {
  vi.mocked(revalidateTag).mockReset()
  process.env.REVALIDATE_SECRET = SECRET
})

describe('POST /api/revalidate', () => {
  it('401s without the header', async () => {
    const res = await POST(request())
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('401s a wrong secret of the same length', async () => {
    const res = await POST(request(SECRET.replace(/.$/, 'X')))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('401s every request when REVALIDATE_SECRET is unset', async () => {
    delete process.env.REVALIDATE_SECRET
    const res = await POST(request(''))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('expires the listings tag immediately with the right secret', async () => {
    const res = await POST(request(SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revalidated: true })
    expect(revalidateTag).toHaveBeenCalledWith('listings', { expire: 0 })
  })
})
