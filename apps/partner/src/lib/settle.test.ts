import { describe, expect, it } from 'vitest'
import { settle } from './settle'

describe('settle', () => {
  it("returns the action's own result", async () => {
    expect(
      await settle<{ ok: boolean }>(
        async () => ({ ok: true }),
        () => ({ ok: false }),
      ),
    ).toEqual({
      ok: true,
    })
  })

  // A server action call rejects when the connection drops mid-upload. Inside
  // a transition that would reach the error boundary and blank the page.
  it('turns a rejected action into the fallback instead of throwing', async () => {
    const result = await settle(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => 'We could not save that photo. Please try again.',
    )
    expect(result).toBe('We could not save that photo. Please try again.')
  })
})
