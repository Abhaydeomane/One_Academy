import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { batchListResponse, instituteDetail, instituteListResponse } from '@one/shared'
import { addMedia, resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/v1/institutes', () => {
  it('returns only published listings (BR-009)', async () => {
    const res = await testApp().get('/api/v1/institutes')
    expect(res.status).toBe(200)
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })

  it('omits a suspended listing (BR-009)', async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.total).toBe(0)
  })

  it('applies pagination defaults', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })

  it('rejects a limit above 50 with VALIDATION_FAILED', async () => {
    const res = await testApp().get('/api/v1/institutes?limit=51')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects the removed rating sort', async () => {
    const res = await testApp().get('/api/v1/institutes?sort=rating')
    expect(res.status).toBe(400)
  })

  it('rejects a fee range whose minimum exceeds its maximum', async () => {
    const res = await testApp().get('/api/v1/institutes?feeMin=900000&feeMax=1000')
    expect(res.status).toBe(400)
  })

  it('matches a free-text query against the name', async () => {
    const res = await testApp().get('/api/v1/institutes?q=alpha')
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })

  it('returns an empty, well-formed response for a query that matches nothing', async () => {
    const res = await testApp().get('/api/v1/institutes?q=kathmandu')
    expect(res.status).toBe(200)
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(0)
    expect(body.items).toEqual([])
    expect(body.facets).toEqual({ exams: [], modes: [] })
  })

  it('accepts a repeated exams parameter', async () => {
    const res = await testApp().get('/api/v1/institutes?exams=jee&exams=neet')
    expect(res.status).toBe(200)
    expect(instituteListResponse.parse(res.body).total).toBe(1)
  })

  it('filters by city slug', async () => {
    const hit = await testApp().get('/api/v1/institutes?city=pune')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?city=delhi')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('filters by mode', async () => {
    const hit = await testApp().get('/api/v1/institutes?mode=OFFLINE')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?mode=ONLINE')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('reports the fee range in integer minor units (BR-005)', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.minFeeAmount).toBe(12500000)
    expect(body.items[0]?.maxFeeAmount).toBe(12500000)
  })

  it('counts only published batches in batchCount', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.batchCount).toBe(1)
  })

  it('returns facet counts for exam and mode', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.facets.exams).toEqual([{ slug: 'jee', label: 'JEE', count: 1 }])
    expect(body.facets.modes).toEqual([{ mode: 'OFFLINE', count: 1 }])
  })

  it('preserves relevance order across the Prisma projection', async () => {
    // The raw query orders the ids; the projection fetches them with `IN`,
    // which does not preserve order. The service must restore it.
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'zeta-alpha-mention',
        name: 'Zeta Classes',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-06-01T00:00:00Z'),
        organizationId: seed.orgId,
        cityId: seed.cityId,
        shortDescription: 'Alpha Academy alumni teach here',
        instituteProfile: { create: { modes: ['ONLINE'] } },
      },
    })

    const res = await testApp().get('/api/v1/institutes?q=alpha')
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(2)
    // Name match (weight A) must come before a description match (weight D).
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })
})

describe('GET /api/v1/institutes/:slug', () => {
  it('returns the detail payload', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)
    expect(res.status).toBe(200)
    const body = instituteDetail.parse(res.body)
    expect(body.name).toBe('Alpha Academy')
    expect(body.establishedYear).toBe(2011)
  })

  it('404s a suspended listing (BR-009)', async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)
    expect(res.status).toBe(404)
  })

  it('404s a draft listing (BR-009)', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.draftSlug}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('301s an old slug to the canonical one (BR-002)', async () => {
    await prisma.listingRedirect.create({
      data: { oldSlug: 'old-alpha', listingId: seed.publishedListingId },
    })
    const res = await testApp().get('/api/v1/institutes/old-alpha').redirects(0)
    expect(res.status).toBe(301)
    expect(res.headers.location).toBe(`/api/v1/institutes/${seed.publishedSlug}`)
  })
})

describe('GET /api/v1/institutes/:slug/batches', () => {
  it('returns only published batches', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}/batches`)
    expect(res.status).toBe(200)
    const body = batchListResponse.parse(res.body)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.title).toBe('JEE 2027')
  })

  it('reports fees as integer minor units (BR-005)', async () => {
    const body = batchListResponse.parse(
      (await testApp().get(`/api/v1/institutes/${seed.publishedSlug}/batches`)).body,
    )
    expect(body.items[0]?.feeAmount).toBe(12500000)
    expect(Number.isInteger(body.items[0]?.feeAmount)).toBe(true)
    expect(body.items[0]?.feeCurrency).toBe('INR')
  })

  it('404s the batches of a suspended listing', async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}/batches`)
    expect(res.status).toBe(404)
  })

  it('404s for a draft listing', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.draftSlug}/batches`)
    expect(res.status).toBe(404)
  })
})

describe('contactPhone never reaches a public response', () => {
  const PHONE = '9876543210'

  beforeEach(async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { contactPhone: PHONE, address: '12 FC Road, Pune 411005' },
    })
    // Comparison needs two published listings.
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'beta-academy',
        name: 'Beta Academy',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-01-02T00:00:00Z'),
        organizationId: seed.otherOrgId,
        cityId: seed.cityId,
        contactPhone: '9123456780',
        instituteProfile: { create: { modes: ['ONLINE'] } },
      },
    })
  })

  it.each([
    ['detail', () => `/api/v1/institutes/${seed.publishedSlug}`],
    ['search', () => '/api/v1/institutes?q=academy'],
    ['landing', () => '/api/v1/landing?path=jee-coaching-in-pune'],
    ['compare', () => `/api/v1/compare?slug=${seed.publishedSlug}&slug=beta-academy`],
  ])('%s omits it', async (_name, path) => {
    const res = await testApp().get(path())
    expect(res.status).toBe(200)
    const text = JSON.stringify(res.body)
    expect(text).toContain(seed.publishedSlug)
    expect(text).not.toContain(PHONE)
    expect(text).not.toContain('9123456780')
    expect(text).not.toContain('contactPhone')
  })

  it('shows the address on the public detail', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)
    expect(res.body.address).toBe('12 FC Road, Pune 411005')
  })
})

describe('public logo and photos (P2c)', () => {
  const BASE = 'http://localhost:4000/media/'

  it('detail returns the logo and ordered photos with absolute URLs', async () => {
    const logo = await addMedia(seed.publishedListingId, 'LOGO')
    const second = await addMedia(seed.publishedListingId, 'PHOTO', 1, 'Library')
    const first = await addMedia(seed.publishedListingId, 'PHOTO', 0)
    const body = instituteDetail.parse(
      (await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)).body,
    )
    expect(body.logo).toEqual({ url: `${BASE}${logo.storageKey}-256.webp`, alt: null })
    expect(body.photos).toEqual([
      {
        url: `${BASE}${first.storageKey}-1600.webp`,
        thumbUrl: `${BASE}${first.storageKey}-640.webp`,
        alt: null,
        width: 1600,
        height: 1067,
      },
      {
        url: `${BASE}${second.storageKey}-1600.webp`,
        thumbUrl: `${BASE}${second.storageKey}-640.webp`,
        alt: 'Library',
        width: 1600,
        height: 1067,
      },
    ])
    expect(body.logoUrl).toBe(`${BASE}${logo.storageKey}-256.webp`)
  })

  it('detail returns logo null and photos [] for a listing without media', async () => {
    const body = instituteDetail.parse(
      (await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)).body,
    )
    expect(body).toMatchObject({ logo: null, photos: [], logoUrl: null })
  })

  it('search cards carry logoUrl', async () => {
    const logo = await addMedia(seed.publishedListingId, 'LOGO')
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.logoUrl).toBe(`${BASE}${logo.storageKey}-256.webp`)
  })

  it("a suspended listing's photos appear in no public response", async () => {
    await addMedia(seed.publishedListingId, 'PHOTO')
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { status: 'SUSPENDED' },
    })
    expect((await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)).status).toBe(404)
    const list = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(list.items).toEqual([])
  })
})
