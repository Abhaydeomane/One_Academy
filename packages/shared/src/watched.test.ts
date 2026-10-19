import { describe, expect, it } from 'vitest'
import {
  diffSnapshot,
  WATCHED_LISTING_FIELDS,
  type WatchedField,
  type WatchedSnapshot,
  type WatchedValue,
  watchedSnapshotSchema,
} from './watched.js'

const base: WatchedSnapshot = {
  name: 'Alpha Academy',
  shortDescription: 'JEE coaching',
  locality: 'Kothrud',
  address: '12 FC Road, Pune 411004',
  contactPhone: '9000000001',
  about: null,
  website: 'https://alpha.example',
  establishedYear: 2011,
  facultyCount: 24,
  modes: ['OFFLINE'],
  exams: ['jee'],
  logo: null,
  photos: ['p1', 'p2'],
}

const altered: Record<WatchedField, WatchedValue> = {
  name: 'Alpha Prime',
  shortDescription: 'NEET coaching',
  locality: 'Baner',
  address: '1 MG Road, Pune 411001',
  contactPhone: '9000000009',
  about: 'Founded by IIT alumni',
  website: 'https://prime.example',
  establishedYear: 2012,
  facultyCount: 30,
  modes: ['OFFLINE', 'ONLINE'],
  exams: ['jee', 'neet'],
  logo: 'l1',
  photos: ['p1', 'p2', 'p3'],
}

describe('diffSnapshot (BR-018)', () => {
  it.each(WATCHED_LISTING_FIELDS)('reports %s changed alone', (field) => {
    const after = { ...base, [field]: altered[field] }
    expect(diffSnapshot(base, after)).toEqual([
      { field, before: base[field], after: altered[field] },
    ])
  })

  it('treats arrays as sets', () => {
    const before = { ...base, exams: ['neet', 'jee'] }
    const after = { ...base, exams: ['jee', 'neet'] }
    expect(diffSnapshot(before, after)).toEqual([])
  })

  it('emits arrays sorted', () => {
    const after = { ...base, modes: ['ONLINE', 'HYBRID'] }
    expect(diffSnapshot(base, after)).toEqual([
      { field: 'modes', before: ['OFFLINE'], after: ['HYBRID', 'ONLINE'] },
    ])
  })

  it('treats empty string and null as equal', () => {
    expect(diffSnapshot({ ...base, locality: '' }, { ...base, locality: null })).toEqual([])
  })

  it('returns nothing for identical snapshots', () => {
    expect(diffSnapshot(base, { ...base })).toEqual([])
  })

  it('reports changes in field order', () => {
    const after = { ...base, exams: ['neet'], name: 'Alpha Prime' }
    expect(diffSnapshot(base, after).map((change) => change.field)).toEqual(['name', 'exams'])
  })
})

describe('diffSnapshot — media (BR-018)', () => {
  it('treats photo order as a change', () => {
    expect(diffSnapshot(base, { ...base, photos: ['p2', 'p1'] })).toEqual([
      { field: 'photos', before: ['p1', 'p2'], after: ['p2', 'p1'] },
    ])
  })

  it('reports an added logo', () => {
    expect(diffSnapshot(base, { ...base, logo: 'l1' })).toEqual([
      { field: 'logo', before: null, after: 'l1' },
    ])
  })

  it('parses a snapshot from before media', () => {
    const p2b = Object.fromEntries(
      Object.entries(base).filter(([field]) => field !== 'logo' && field !== 'photos'),
    )
    expect(watchedSnapshotSchema.parse(p2b)).toMatchObject({ logo: null, photos: [] })
  })
})
