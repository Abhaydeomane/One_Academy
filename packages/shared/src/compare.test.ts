import { describe, expect, it } from 'vitest'
import {
  buildComparePath,
  COMPARE_MAX,
  COMPARE_MIN,
  dedupeSlugs,
  parseBatchPins,
} from './compare.js'

describe('parseBatchPins', () => {
  it('parses slug:batchId pairs', () => {
    expect(parseBatchPins(['allen:b1', 'aakash:b2'])).toEqual({
      pins: [
        { slug: 'allen', batchId: 'b1' },
        { slug: 'aakash', batchId: 'b2' },
      ],
      invalid: [],
    })
  })

  it('returns nothing for undefined', () => {
    expect(parseBatchPins(undefined)).toEqual({ pins: [], invalid: [] })
  })

  it('reports a pin with no separator as invalid', () => {
    expect(parseBatchPins(['allen'])).toEqual({ pins: [], invalid: ['allen'] })
  })

  it('reports an empty side as invalid', () => {
    expect(parseBatchPins([':b1', 'allen:'])).toEqual({ pins: [], invalid: [':b1', 'allen:'] })
  })

  // Slugs cannot contain a colon, batch ids are opaque, so splitting on the
  // FIRST colon is the only reading that cannot corrupt an id.
  it('splits on the first colon only', () => {
    expect(parseBatchPins(['allen:b1:extra'])).toEqual({
      pins: [{ slug: 'allen', batchId: 'b1:extra' }],
      invalid: [],
    })
  })

  // Last pin wins: the selector appends, and re-picking must not accumulate.
  it('keeps the last pin for a repeated slug', () => {
    expect(parseBatchPins(['allen:b1', 'allen:b2']).pins).toEqual([
      { slug: 'allen', batchId: 'b2' },
    ])
  })
})

describe('dedupeSlugs', () => {
  it('removes duplicates and preserves first-seen order', () => {
    expect(dedupeSlugs(['b', 'a', 'b'])).toEqual(['b', 'a'])
  })

  it('drops empty strings', () => {
    expect(dedupeSlugs(['a', '', 'b'])).toEqual(['a', 'b'])
  })
})

describe('buildComparePath', () => {
  it('emits repeated slug params', () => {
    expect(buildComparePath(['allen', 'aakash'], [])).toBe('/compare?slug=allen&slug=aakash')
  })

  it('appends pins as slug:batchId', () => {
    expect(buildComparePath(['allen'], [{ slug: 'allen', batchId: 'b1' }])).toBe(
      '/compare?slug=allen&batch=allen%3Ab1',
    )
  })

  // A pin whose slug is not being compared is meaningless and must not ride
  // along: otherwise changing the selection leaks pins for dropped columns.
  it('drops a pin for a slug that is not in the selection', () => {
    expect(buildComparePath(['allen'], [{ slug: 'ghost', batchId: 'b9' }])).toBe(
      '/compare?slug=allen',
    )
  })

  it('round-trips through parseBatchPins', () => {
    const pins = [{ slug: 'allen', batchId: 'b1' }]
    const url = new URL(`http://x${buildComparePath(['allen'], pins)}`)
    expect(parseBatchPins(url.searchParams.getAll('batch')).pins).toEqual(pins)
  })
})

describe('bounds', () => {
  it('are the BR-008 bounds', () => {
    expect([COMPARE_MIN, COMPARE_MAX]).toEqual([2, 4])
  })
})
