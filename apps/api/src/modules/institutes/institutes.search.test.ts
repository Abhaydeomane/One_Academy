import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import {
  examFacets,
  modeFacets,
  searchPublished,
  type SearchFilters,
} from './institutes.search.repository.js'

const base: SearchFilters = { sort: 'relevance', skip: 0, take: 20 }

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

  // Name match. Two batches, ₹25,000 and ₹1,00,000 — the pair that exposes
  // interval-overlap fee filtering as wrong.
  const allen = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-career-institute',
      name: 'Allen Career Institute',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
      locality: 'Kothrud',
      shortDescription: 'Residential programme',
      instituteProfile: { create: { modes: ['OFFLINE'] } },
      tags: { create: [{ tagId: jee.id }] },
      batches: {
        create: [
          {
            title: 'JEE Main',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-04-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: 2_500_000,
            status: 'PUBLISHED',
          },
          {
            title: 'JEE Advanced',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-05-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: 10_000_000,
            status: 'PUBLISHED',
          },
        ],
      },
    },
  })

  // Description-only match for "allen", to prove weighting.
  const mentor = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'mentor-classes',
      name: 'Mentor Classes',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-04-01T00:00:00Z'),
      organizationId: org.id,
      cityId: mumbai.id,
      locality: 'Andheri',
      shortDescription: 'Faculty formerly of Allen',
      instituteProfile: { create: { modes: ['ONLINE', 'HYBRID'] } },
      tags: { create: [{ tagId: neet.id }] },
      batches: {
        create: {
          title: 'NEET Foundation',
          exam: 'NEET',
          mode: 'ONLINE',
          startDate: new Date('2027-06-01T00:00:00Z'),
          seatsTotal: 10,
          seatsAvailable: 10,
          feeAmount: 4_000_000,
          status: 'PUBLISHED',
        },
      },
    },
  })

  // Must never appear: unpublished (BR-009).
  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-draft',
      name: 'Allen Draft Institute',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: pune.id,
      instituteProfile: { create: { modes: ['OFFLINE'] } },
    },
  })

  // No InstituteProfile row at all — must still be findable.
  const sparse = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'sparse-academy',
      name: 'Sparse Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-05-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
    },
  })

  return { allen, mentor, sparse, pune, mumbai, org }
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('searchPublished — matching', () => {
  it('returns every published listing when there is no query', async () => {
    await seedCatalogue()
    const { hits, total } = await searchPublished({ ...base, sort: 'recent' })
    expect(total).toBe(3)
    expect(hits).toHaveLength(3)
  })

  it('excludes unpublished listings (BR-009)', async () => {
    await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen' })
    const draft = await prisma.listing.findUniqueOrThrow({ where: { slug: 'allen-draft' } })
    expect(hits.map((hit) => hit.id)).not.toContain(draft.id)
  })

  it('matches on name', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen' })
    expect(hits[0]?.id).toBe(allen.id)
  })

  it('ranks a name match above a description match', async () => {
    const { allen, mentor } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen' })
    const ids = hits.map((hit) => hit.id)
    expect(ids.indexOf(allen.id)).toBeLessThan(ids.indexOf(mentor.id))
  })

  it('matches on locality', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'kothrud' })
    expect(hits.map((hit) => hit.id)).toEqual([allen.id])
  })

  it('matches on city name', async () => {
    await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'mumbai' })
    expect(hits).toHaveLength(1)
  })

  it('matches on exam label', async () => {
    const { mentor } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'neet' })
    expect(hits.map((hit) => hit.id)).toEqual([mentor.id])
  })

  it('returns nothing for a term that appears nowhere', async () => {
    await seedCatalogue()
    const { hits, total } = await searchPublished({ ...base, q: 'kathmandu' })
    expect(hits).toEqual([])
    expect(total).toBe(0)
  })

  it('treats SQL metacharacters as search text, not syntax', async () => {
    await seedCatalogue()
    const malicious = '\'; DROP TABLE "Listing"; --'
    const { hits } = await searchPublished({ ...base, q: malicious })
    expect(hits).toEqual([])
    // The table is still there.
    expect(await prisma.listing.count()).toBe(4)
  })

  it('finds a listing that has no InstituteProfile row', async () => {
    const { sparse } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'sparse' })
    expect(hits.map((hit) => hit.id)).toEqual([sparse.id])
  })
})

describe('searchPublished — fee aggregates and filtering', () => {
  it('reports the fee range from published batches', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'career' })
    const hit = hits.find((candidate) => candidate.id === allen.id)
    expect(hit?.minFeeAmount).toBe(2_500_000)
    expect(hit?.maxFeeAmount).toBe(10_000_000)
    expect(hit?.publishedBatchCount).toBe(2)
  })

  it('reports nulls for a listing with no published batches', async () => {
    const { sparse } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'sparse' })
    expect(hits[0]?.id).toBe(sparse.id)
    expect(hits[0]?.minFeeAmount).toBeNull()
    expect(hits[0]?.publishedBatchCount).toBe(0)
  })

  it('matches a listing with a batch inside the range', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({
      ...base,
      sort: 'recent',
      feeMin: 2_000_000,
      feeMax: 3_000_000,
    })
    expect(hits.map((hit) => hit.id)).toContain(allen.id)
  })

  it('does NOT match on interval overlap when no single batch is in range', async () => {
    // Allen has batches at ₹25,000 and ₹1,00,000. Its min/max interval spans
    // ₹40,000–₹50,000, but no actual batch is in that band, so it must not
    // appear. This is the bug the spec calls out in §6.
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({
      ...base,
      sort: 'recent',
      feeMin: 4_000_000,
      feeMax: 5_000_000,
    })
    expect(hits.map((hit) => hit.id)).not.toContain(allen.id)
  })

  it('excludes draft batches from the fee filter', async () => {
    const { sparse } = await seedCatalogue()
    await prisma.batch.create({
      data: {
        listingId: sparse.id,
        title: 'Unpublished',
        exam: 'JEE',
        startDate: new Date('2027-04-01T00:00:00Z'),
        seatsTotal: 5,
        seatsAvailable: 5,
        feeAmount: 3_000_000,
        status: 'DRAFT',
      },
    })

    const { hits } = await searchPublished({
      ...base,
      sort: 'recent',
      feeMin: 2_900_000,
      feeMax: 3_100_000,
    })
    expect(hits.map((hit) => hit.id)).not.toContain(sparse.id)
  })
})

describe('searchPublished — filters and sorting', () => {
  it('filters by city slug', async () => {
    await seedCatalogue()
    const { total } = await searchPublished({ ...base, sort: 'recent', citySlug: 'mumbai' })
    expect(total).toBe(1)
  })

  it('treats multiple exams as OR', async () => {
    await seedCatalogue()
    const { total } = await searchPublished({
      ...base,
      sort: 'recent',
      examSlugs: ['jee', 'neet'],
    })
    expect(total).toBe(2)
  })

  it('filters by mode', async () => {
    const { mentor } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, sort: 'recent', mode: 'HYBRID' })
    expect(hits.map((hit) => hit.id)).toEqual([mentor.id])
  })

  it('sorts by ascending minimum fee, listings without batches last', async () => {
    const { allen, mentor, sparse } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, sort: 'fee_asc' })
    expect(hits.map((hit) => hit.id)).toEqual([allen.id, mentor.id, sparse.id])
  })

  it('sorts by name', async () => {
    await seedCatalogue()
    const { hits } = await searchPublished({ ...base, sort: 'name', take: 3 })
    expect(hits).toHaveLength(3)
  })

  it('paginates while reporting the full total', async () => {
    await seedCatalogue()
    const { hits, total } = await searchPublished({ ...base, sort: 'recent', skip: 1, take: 1 })
    expect(hits).toHaveLength(1)
    expect(total).toBe(3)
  })
})

describe('facets', () => {
  it('counts exams over the filtered set', async () => {
    await seedCatalogue()
    const facets = await examFacets({ ...base, sort: 'recent' })
    expect(facets).toEqual(
      expect.arrayContaining([
        { slug: 'jee', label: 'JEE', count: 1 },
        { slug: 'neet', label: 'NEET', count: 1 },
      ]),
    )
  })

  it('excludes the exam filter from its own counts', async () => {
    // Selecting JEE must still report NEET's count, or the counts are useless
    // for navigation.
    await seedCatalogue()
    const facets = await examFacets({ ...base, sort: 'recent', examSlugs: ['jee'] })
    expect(facets.find((facet) => facet.slug === 'neet')?.count).toBe(1)
  })

  it('applies other filters to exam counts', async () => {
    await seedCatalogue()
    const facets = await examFacets({ ...base, sort: 'recent', citySlug: 'mumbai' })
    expect(facets.map((facet) => facet.slug)).toEqual(['neet'])
  })

  it('counts modes, excluding the mode filter from its own counts', async () => {
    await seedCatalogue()
    const facets = await modeFacets({ ...base, sort: 'recent', mode: 'OFFLINE' })
    const byMode = Object.fromEntries(facets.map((facet) => [facet.mode, facet.count]))
    expect(byMode.OFFLINE).toBe(1)
    expect(byMode.ONLINE).toBe(1)
    expect(byMode.HYBRID).toBe(1)
  })

  it('respects the free-text query in facet counts', async () => {
    await seedCatalogue()
    const facets = await examFacets({ ...base, q: 'kothrud' })
    expect(facets).toEqual([{ slug: 'jee', label: 'JEE', count: 1 }])
  })
})
