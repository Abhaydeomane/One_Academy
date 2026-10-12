import { describe, expect, it } from 'vitest'
import { formatDateRange, formatFee, formatFeeRange, formatSeats } from './format.js'

describe('formatFee (BR-005)', () => {
  it('renders minor units as rupees with Indian digit grouping', () => {
    expect(formatFee(12500000, 'INR')).toBe('₹1,25,000')
  })

  it('renders zero', () => {
    expect(formatFee(0, 'INR')).toBe('₹0')
  })

  it('renders a value with no paise component', () => {
    expect(formatFee(99900, 'INR')).toBe('₹999')
  })

  it('falls back to a currency prefix for other currencies', () => {
    expect(formatFee(100000, 'USD')).toBe('USD 1,000')
  })
})

describe('formatDateRange', () => {
  it('renders a start and end date', () => {
    expect(formatDateRange('2027-04-01T00:00:00Z', '2027-12-20T00:00:00Z')).toBe(
      '1 Apr 2027 – 20 Dec 2027',
    )
  })

  it('renders an open-ended range', () => {
    expect(formatDateRange('2027-04-01T00:00:00Z', null)).toBe('From 1 Apr 2027')
  })
})

describe('formatSeats', () => {
  it('reports remaining seats', () => {
    expect(formatSeats(18, 60)).toBe('18 of 60 seats left')
  })

  it('reports a full batch without numbers', () => {
    expect(formatSeats(0, 60)).toBe('Full')
  })
})

describe('formatFeeRange', () => {
  it('renders a single value when both bounds match', () => {
    expect(formatFeeRange(12500000, 12500000)).toBe('₹1,25,000')
  })

  it('renders a range when the bounds differ', () => {
    expect(formatFeeRange(2500000, 10000000)).toBe('₹25,000 – ₹1,00,000')
  })

  it('returns null when there are no published batches', () => {
    expect(formatFeeRange(null, null)).toBeNull()
  })

  it('returns null when only one bound is present, rather than half a range', () => {
    expect(formatFeeRange(2500000, null)).toBeNull()
  })
})
