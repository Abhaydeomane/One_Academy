import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import type { SearchFilters } from './institutes.search.repository.js'
import {
  citiesForExam,
  feeStatsForFilters,
  findCityBySlug,
  findExamBySlug,
  indexableCombinations,
  modeCountsFor,
} from './institutes.landing.repository.js'

const base: SearchFilters = { sort: 'recent', skip: 0, take: 20 }

/// Pune gets three JEE institutes (so it is indexable) with fees spanning
/// ₹25,000 to ₹1,50,000; Mumbai gets one. One Pune listing is also NEET.
async function seedCatalogue() {
  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const mumbai = await prisma.city.create({
    data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
  const neet = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  const make = async (options: {
    slug: string
    cityId: string
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[]
    tagIds: string[]
    fee: number
    status?: 'PUBLISHED' | 'DRAFT'
  }) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: options.slug,
        name: options.slug,
        status: options.status ?? 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId: options.cityId,
        instituteProfile: { create: { modes: options.modes } },
        tags: { create: options.tagIds.map((tagId) => ({ tagId })) },
        batches: {
          create: {
            title: `${options.slug} batch`,
            exam: 'JEE',
            mode: options.modes[0] ?? 'OFFLINE',
            startDate: new Date('2028-04-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: options.fee,
            status: 'PUBLISHED',
          },
        },
      },
    })

  await make({
    slug: 'pune-a',
    cityId: pune.id,
    modes: ['OFFLINE'],
    tagIds: [jee.id],
    fee: 2_500_000,
  })
  await make({
    slug: 'pune-b',
    cityId: pune.id,
    modes: ['OFFLINE'],
    tagIds: [jee.id],
    fee: 7_000_000,
  })
  await make({
    slug: 'pune-c',
    cityId: pune.id,
    modes: ['ONLINE'],
    tagIds: [jee.id, neet.id],
    fee: 15_000_000,
  })
  await make({
    slug: 'mumbai-a',
    cityId: mumbai.id,
    modes: ['ONLINE'],
    tagIds: [jee.id],
    fee: 5_000_000,
  })
  // Unpublished: must never be counted anywhere (BR-009).
  await make({
    slug: 'pune-draft',
    cityId: pune.id,
    modes: ['OFFLINE'],
    tagIds: [jee.id],
    fee: 1_000,
    status: 'DRAFT',
  })

  return { pune, mumbai, jee, neet }
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('slug lookups', () => {
  it('finds an exam by slug', async () => {
    await seedCatalogue()
    expect(await findExamBySlug('jee')).toEqual({ slug: 'jee', label: 'JEE' })
  })

  it('returns null for an unknown exam', async () => {
    await seedCatalogue()
    expect(await findExamBySlug('gate')).toBeNull()
  })

  it('does not treat a non-exam tag as an exam', async () => {
    await seedCatalogue()
    await prisma.tag.create({ data: { slug: 'hostel', label: 'Hostel', kind: 'AMENITY' } })
    expect(await findExamBySlug('hostel')).toBeNull()
  })

  it('finds a city by slug with its state', async () => {
    await seedCatalogue()
    expect(await findCityBySlug('pune')).toEqual({
      slug: 'pune',
      name: 'Pune',
      state: 'Maharashtra',
    })
  })

  it('returns null for an unknown city', async () => {
    await seedCatalogue()
    expect(await findCityBySlug('jaipur')).toBeNull()
  })
})

describe('feeStatsForFilters', () => {
  it('spans the whole matching set rather than one page', async () => {
    await seedCatalogue()
    // take: 1 proves the aggregate ignores pagination entirely.
    const stats = await feeStatsForFilters({
      ...base,
      take: 1,
      citySlug: 'pune',
      examSlugs: ['jee'],
    })
    expect(stats.minFeeAmount).toBe(2_500_000)
    expect(stats.maxFeeAmount).toBe(15_000_000)
  })

  it('excludes unpublished listings', async () => {
    await seedCatalogue()
    const stats = await feeStatsForFilters({ ...base, citySlug: 'pune', examSlugs: ['jee'] })
    // The draft listing's ₹10 fee must not become the minimum.
    expect(stats.minFeeAmount).toBe(2_500_000)
  })

  it('respects the mode filter', async () => {
    await seedCatalogue()
    const stats = await feeStatsForFilters({
      ...base,
      citySlug: 'pune',
      examSlugs: ['jee'],
      mode: 'ONLINE',
    })
    expect(stats.minFeeAmount).toBe(15_000_000)
    expect(stats.maxFeeAmount).toBe(15_000_000)
  })

  it('returns nulls when nothing matches', async () => {
    await seedCatalogue()
    const stats = await feeStatsForFilters({ ...base, citySlug: 'pune', examSlugs: ['gate'] })
    expect(stats).toEqual({ minFeeAmount: null, maxFeeAmount: null })
  })
})

describe('citiesForExam', () => {
  it('lists cities with counts, busiest first', async () => {
    await seedCatalogue()
    expect(await citiesForExam('jee')).toEqual([
      { slug: 'pune', name: 'Pune', count: 3 },
      { slug: 'mumbai', name: 'Mumbai', count: 1 },
    ])
  })

  it('counts only published listings', async () => {
    await seedCatalogue()
    const cities = await citiesForExam('jee')
    expect(cities.find((city) => city.slug === 'pune')?.count).toBe(3)
  })

  it('returns an empty list for an exam nobody teaches', async () => {
    await seedCatalogue()
    expect(await citiesForExam('gate')).toEqual([])
  })
})

describe('modeCountsFor', () => {
  it('counts listings per mode for one combination', async () => {
    await seedCatalogue()
    const byMode = Object.fromEntries(
      (await modeCountsFor('jee', 'pune')).map((row) => [row.mode, row.count]),
    )
    expect(byMode.OFFLINE).toBe(2)
    expect(byMode.ONLINE).toBe(1)
    expect(byMode.HYBRID).toBeUndefined()
  })

  it('is scoped to the city', async () => {
    await seedCatalogue()
    const byMode = Object.fromEntries(
      (await modeCountsFor('jee', 'mumbai')).map((row) => [row.mode, row.count]),
    )
    expect(byMode.ONLINE).toBe(1)
    expect(byMode.OFFLINE).toBeUndefined()
  })
})

describe('indexableCombinations', () => {
  it('returns only combinations at or above the threshold', async () => {
    await seedCatalogue()
    expect(await indexableCombinations(3)).toEqual([
      { examSlug: 'jee', citySlug: 'pune', count: 3 },
    ])
  })

  it('includes thinner combinations when the threshold is lowered', async () => {
    await seedCatalogue()
    expect(await indexableCombinations(1)).toEqual(
      expect.arrayContaining([
        { examSlug: 'jee', citySlug: 'pune', count: 3 },
        { examSlug: 'jee', citySlug: 'mumbai', count: 1 },
        { examSlug: 'neet', citySlug: 'pune', count: 1 },
      ]),
    )
  })

  it('never counts unpublished listings toward the threshold', async () => {
    await seedCatalogue()
    // Pune/JEE has 3 published plus 1 draft. If drafts counted it would be 4.
    expect((await indexableCombinations(4)).length).toBe(0)
  })
})
