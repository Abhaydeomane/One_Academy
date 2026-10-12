import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from './helpers/db.js'

// The vector is cast to text so assertions can look for weighted lexemes,
// which print as 'allen':1A — lexeme, position, weight.
async function vectorFor(listingId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ v: string | null }[]>`
    SELECT "searchVector"::text AS v FROM "Listing" WHERE id = ${listingId}
  `
  return rows[0]?.v ?? ''
}

async function seedListing(overrides: { name?: string; locality?: string } = {}) {
  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })

  const listing = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-career-institute',
      name: overrides.name ?? 'Allen Career Institute',
      status: 'PUBLISHED',
      organizationId: org.id,
      cityId: city.id,
      locality: overrides.locality ?? 'Kothrud',
      shortDescription: 'Residential coaching programme',
    },
  })

  return { listing, city, org }
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('listing search vector triggers', () => {
  it('populates the vector on insert, weighting name A and locality/city C', async () => {
    const { listing } = await seedListing()
    const vector = await vectorFor(listing.id)

    expect(vector).toMatch(/'allen':\d+A/)
    expect(vector).toMatch(/'kothrud':\d+C/)
    expect(vector).toMatch(/'pune':\d+C/)
    // Description terms sit at weight D. Postgres treats D as the default and
    // omits it when printing a tsvector, so "programme" — stemmed to
    // "programm" — appears with a position and no weight letter. Asserting a
    // literal D here would always fail.
    expect(vector).toMatch(/'programm':\d+(?:\s|$)/)
    expect(vector).not.toMatch(/'programm':\d+[ABC]/)
  })

  it('folds exam labels in at weight B when a tag is attached', async () => {
    const { listing } = await seedListing()
    const tag = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })

    expect(await vectorFor(listing.id)).not.toMatch(/'jee'/)

    await prisma.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } })

    expect(await vectorFor(listing.id)).toMatch(/'jee':\d+B/)
  })

  it('drops an exam term when the tag is detached', async () => {
    const { listing } = await seedListing()
    const tag = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
    await prisma.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } })

    await prisma.listingTag.delete({
      where: { listingId_tagId: { listingId: listing.id, tagId: tag.id } },
    })

    expect(await vectorFor(listing.id)).not.toMatch(/'jee'/)
  })

  it('recomputes every affected listing when a tag label is renamed', async () => {
    const { listing } = await seedListing()
    const tag = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
    await prisma.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } })

    await prisma.tag.update({ where: { id: tag.id }, data: { label: 'Olympiad' } })

    const vector = await vectorFor(listing.id)
    expect(vector).toMatch(/'olympiad':\d+B/)
    expect(vector).not.toMatch(/'jee'/)
  })

  it('updates the vector for a write that bypasses the repository entirely', async () => {
    // This is the test that justifies triggers over application-maintained
    // indexing (ADR 0011). A migration, a backfill or a manual psql fix must
    // not be able to leave a listing invisible to search.
    const { listing } = await seedListing()

    await prisma.$executeRaw`
      UPDATE "Listing" SET name = 'Aakash Institute' WHERE id = ${listing.id}
    `

    const vector = await vectorFor(listing.id)
    expect(vector).toMatch(/'aakash':\d+A/)
    expect(vector).not.toMatch(/'allen'/)
  })

  it('tolerates a listing with no locality or description', async () => {
    const city = await prisma.city.create({
      data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
    })
    const org = await prisma.organization.create({ data: { name: 'Beta', slug: 'beta' } })
    const listing = await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'sparse-institute',
        name: 'Sparse Institute',
        status: 'DRAFT',
        organizationId: org.id,
        cityId: city.id,
      },
    })

    const vector = await vectorFor(listing.id)
    expect(vector).toMatch(/'spars':\d+A/)
    expect(vector).toMatch(/'mumbai':\d+C/)
  })
})
