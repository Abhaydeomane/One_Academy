import { describe, expect, it } from 'vitest'
import { normalizePhone, phoneSchema } from './phone.js'

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['098765-43210', '9876543210'],
    ['(98765) 43210', '9876543210'],
  ])('normalises %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })

  it('leaves a number it cannot interpret for the schema to reject', () => {
    expect(phoneSchema.safeParse(normalizePhone('12345')).success).toBe(false)
  })
})

describe('phoneSchema', () => {
  it('accepts exactly ten digits', () => {
    expect(phoneSchema.safeParse('9876543210').success).toBe(true)
  })

  it('rejects anything else', () => {
    expect(phoneSchema.safeParse('98765 43210').success).toBe(false)
    expect(phoneSchema.safeParse('98765432101').success).toBe(false)
  })
})
