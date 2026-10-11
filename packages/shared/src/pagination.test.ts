import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { paginated, paginationQuery } from './pagination.js'

describe('paginationQuery', () => {
  it('applies defaults when absent', () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('coerces numeric strings from query parameters', () => {
    expect(paginationQuery.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 })
  })

  it('rejects a limit above 50', () => {
    expect(paginationQuery.safeParse({ limit: '51' }).success).toBe(false)
  })

  it('rejects a page below 1', () => {
    expect(paginationQuery.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('paginated', () => {
  it('validates an envelope of the given item type', () => {
    const schema = paginated(z.object({ id: z.string() }))
    const value = { items: [{ id: 'a' }], total: 1, page: 1, limit: 20 }
    expect(schema.parse(value)).toEqual(value)
  })

  it('rejects items of the wrong shape', () => {
    const schema = paginated(z.object({ id: z.string() }))
    expect(schema.safeParse({ items: [{ id: 7 }], total: 1, page: 1, limit: 20 }).success).toBe(
      false,
    )
  })
})
