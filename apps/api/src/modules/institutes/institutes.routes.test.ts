import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { batchListResponse, instituteDetail, instituteListResponse } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
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

  it('filters by city slug', async () => {
    const hit = await testApp().get('/api/v1/institutes?city=pune')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?city=delhi')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('filters by exam tag', async () => {
    const hit = await testApp().get('/api/v1/institutes?exam=jee')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?exam=cat')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('filters by mode', async () => {
    const hit = await testApp().get('/api/v1/institutes?mode=OFFLINE')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?mode=ONLINE')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('counts only published batches in batchCount', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.batchCount).toBe(1)
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

  it('404s for a draft listing', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.draftSlug}/batches`)
    expect(res.status).toBe(404)
  })
})
