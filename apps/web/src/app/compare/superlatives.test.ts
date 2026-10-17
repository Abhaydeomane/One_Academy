import { describe, expect, it } from 'vitest'
import { superlatives } from './superlatives'

const column = (slug: string, feeAmount: number | null, startDate: string | null) => ({
  institute: { slug },
  pinned: feeAmount === null ? null : { feeAmount, startDate },
})

describe('superlatives', () => {
  it('finds the lowest fee and the soonest start', () => {
    const result = superlatives([
      column('a', 5_000_000, '2030-06-01T00:00:00Z'),
      column('b', 3_000_000, '2030-09-01T00:00:00Z'),
      column('c', 8_000_000, '2030-02-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: 'b', soonestStartSlug: 'c' })
  })

  // A tie has no winner: tagging the first column would invent a distinction
  // the data does not contain.
  it('awards nothing when every value ties', () => {
    const result = superlatives([
      column('a', 5_000_000, '2030-06-01T00:00:00Z'),
      column('b', 5_000_000, '2030-06-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: null, soonestStartSlug: null })
  })

  it('awards the fee but not the date when only the date ties', () => {
    const result = superlatives([
      column('a', 5_000_000, '2030-06-01T00:00:00Z'),
      column('b', 3_000_000, '2030-06-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: 'b', soonestStartSlug: null })
  })

  it('ignores columns with no pinned batch', () => {
    const result = superlatives([
      column('a', null, null),
      column('b', 7_000_000, '2030-06-01T00:00:00Z'),
      column('c', 9_000_000, '2030-07-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: 'b', soonestStartSlug: 'b' })
  })

  it('awards nothing when only one column has a batch', () => {
    const result = superlatives([
      column('a', null, null),
      column('b', 7_000_000, '2030-06-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: null, soonestStartSlug: null })
  })
})
