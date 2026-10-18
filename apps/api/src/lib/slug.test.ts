import { describe, expect, it } from 'vitest'
import { slugify } from './slug.js'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Alpha Academy  Pune')).toBe('alpha-academy-pune')
  })

  it('strips accents and punctuation', () => {
    expect(slugify("Ré's Classes & Co.")).toBe('re-s-classes-co')
  })

  it('returns an empty string for a non-Latin name, for the caller to replace', () => {
    expect(slugify('ज्ञान अकादमी')).toBe('')
  })

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} b`)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})
