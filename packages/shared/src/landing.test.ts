import { describe, expect, it } from 'vitest'
import { buildLandingPath, LANDING_MIN_INDEXABLE, parseLandingPath } from './landing.js'

describe('buildLandingPath', () => {
  it('builds an exam and city path', () => {
    expect(buildLandingPath({ examSlug: 'jee', citySlug: 'pune' })).toBe('/jee-coaching-in-pune')
  })

  it('prefixes the mode in lower case', () => {
    expect(buildLandingPath({ examSlug: 'jee', citySlug: 'pune', mode: 'ONLINE' })).toBe(
      '/online-jee-coaching-in-pune',
    )
  })

  it('treats a null mode as absent', () => {
    expect(buildLandingPath({ examSlug: 'neet', citySlug: 'mumbai', mode: null })).toBe(
      '/neet-coaching-in-mumbai',
    )
  })
})

describe('parseLandingPath', () => {
  it('parses a simple exam and city', () => {
    expect(parseLandingPath('/jee-coaching-in-pune')).toEqual([
      { examSlug: 'jee', citySlug: 'pune' },
    ])
  })

  it('accepts a path with no leading slash', () => {
    expect(parseLandingPath('jee-coaching-in-pune')).toEqual([
      { examSlug: 'jee', citySlug: 'pune' },
    ])
  })

  it('handles a hyphenated exam slug', () => {
    expect(parseLandingPath('/jee-advanced-coaching-in-pune')).toEqual([
      { examSlug: 'jee-advanced', citySlug: 'pune' },
    ])
  })

  it('handles a hyphenated city slug', () => {
    expect(parseLandingPath('/jee-coaching-in-new-delhi')).toEqual([
      { examSlug: 'jee', citySlug: 'new-delhi' },
    ])
  })

  it('handles hyphens on both sides at once', () => {
    expect(parseLandingPath('/jee-advanced-coaching-in-new-delhi')).toEqual([
      { examSlug: 'jee-advanced', citySlug: 'new-delhi' },
    ])
  })

  it('offers the mode reading first, then the literal reading', () => {
    // "online-jee" is probably mode ONLINE plus exam "jee", but it could be an
    // exam literally slugged "online-jee". The caller resolves against real
    // data; the parser only ranks the possibilities.
    expect(parseLandingPath('/online-jee-coaching-in-pune')).toEqual([
      { examSlug: 'jee', citySlug: 'pune', mode: 'ONLINE' },
      { examSlug: 'online-jee', citySlug: 'pune' },
    ])
  })

  it('offers both readings for every mode prefix', () => {
    expect(parseLandingPath('/offline-neet-coaching-in-pune')[0]).toEqual({
      examSlug: 'neet',
      citySlug: 'pune',
      mode: 'OFFLINE',
    })
    expect(parseLandingPath('/hybrid-neet-coaching-in-pune')[0]).toEqual({
      examSlug: 'neet',
      citySlug: 'pune',
      mode: 'HYBRID',
    })
  })

  it('rejects a path with no infix', () => {
    expect(parseLandingPath('/jee-pune')).toEqual([])
  })

  it('rejects a path with the infix twice', () => {
    expect(parseLandingPath('/a-coaching-in-b-coaching-in-c')).toEqual([])
  })

  it('rejects an empty exam or city segment', () => {
    expect(parseLandingPath('/-coaching-in-pune')).toEqual([])
    expect(parseLandingPath('/jee-coaching-in-')).toEqual([])
  })

  it('rejects slugs that are not lower-case kebab case', () => {
    expect(parseLandingPath('/JEE-coaching-in-pune')).toEqual([])
    expect(parseLandingPath('/jee_main-coaching-in-pune')).toEqual([])
    expect(parseLandingPath('/jee--coaching-in-pune')).toEqual([])
  })

  it('rejects the bare infix', () => {
    expect(parseLandingPath('/-coaching-in-')).toEqual([])
  })

  it('round-trips everything it parses', () => {
    for (const path of [
      '/jee-coaching-in-pune',
      '/jee-advanced-coaching-in-new-delhi',
      '/online-jee-coaching-in-pune',
    ]) {
      const first = parseLandingPath(path)[0]
      expect(first).toBeDefined()
      expect(buildLandingPath(first!)).toBe(path)
    }
  })
})

describe('LANDING_MIN_INDEXABLE', () => {
  it('is the single source of the indexability threshold', () => {
    expect(LANDING_MIN_INDEXABLE).toBe(3)
  })
})
