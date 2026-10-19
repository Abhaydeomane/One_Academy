import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { landingIndexableResponse, landingPageResponse } from '@one/shared'
import { resetDb } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

/// Pune: three JEE institutes, two offline and one online, one of which is
/// also NEET. Mumbai: one JEE institute, online — so its online variant is a
/// duplicate of its parent.
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

  const make = async (
    slug: string,
    cityId: string,
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[],
    tagIds: string[],
    fee: number,
  ) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name: slug.toUpperCase(),
        status: 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId,
        instituteProfile: { create: { modes } },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        batches: {
          create: {
            title: `${slug} batch`,
            exam: 'JEE',
            mode: modes[0] ?? 'OFFLINE',
            startDate: new Date('2028-04-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: fee,
            status: 'PUBLISHED',
          },
        },
      },
    })

  await make('pune-a', pune.id, ['OFFLINE'], [jee.id], 2_500_000)
  await make('pune-b', pune.id, ['OFFLINE'], [jee.id], 7_000_000)
  await make('pune-c', pune.id, ['ONLINE'], [jee.id, neet.id], 15_000_000)
  await make('mumbai-a', mumbai.id, ['ONLINE'], [jee.id], 5_000_000)
}

beforeEach(async () => {
  await resetDb()
  await seedCatalogue()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const get = (path: string) => testApp().get(`/api/v1/landing?path=${encodeURIComponent(path)}`)

describe('GET /api/v1/landing — resolution', () => {
  it('resolves an exam and city path', async () => {
    const res = await get('/jee-coaching-in-pune')
    expect(res.status).toBe(200)
    const body = landingPageResponse.parse(res.body)
    expect(body.exam).toEqual({ slug: 'jee', label: 'JEE' })
    expect(body.city).toEqual({ slug: 'pune', name: 'Pune', state: 'Maharashtra' })
    expect(body.mode).toBeNull()
    expect(body.listings.total).toBe(3)
  })

  it('resolves a mode variant', async () => {
    const res = await get('/offline-jee-coaching-in-pune')
    expect(res.status).toBe(200)
    const body = landingPageResponse.parse(res.body)
    expect(body.mode).toBe('OFFLINE')
    expect(body.listings.total).toBe(2)
    expect(body.parentTotal).toBe(3)
  })

  it('404s an unknown exam', async () => {
    expect((await get('/gate-coaching-in-pune')).status).toBe(404)
  })

  it('404s an unknown city', async () => {
    expect((await get('/jee-coaching-in-jaipur')).status).toBe(404)
  })

  it('404s a combination with no listings', async () => {
    // NEET exists and Mumbai exists, but no NEET institute is in Mumbai.
    expect((await get('/neet-coaching-in-mumbai')).status).toBe(404)
  })

  it('404s a path that is not a landing URL at all', async () => {
    expect((await get('/not-a-landing-page')).status).toBe(404)
  })

  it('rejects a missing path parameter with VALIDATION_FAILED', async () => {
    const res = await testApp().get('/api/v1/landing')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })
})

describe('GET /api/v1/landing — eligibility', () => {
  it('is indexable at three listings', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(3)
    expect(body.indexable).toBe(true)
  })

  it('does not count a suspended listing', async () => {
    await prisma.listing.update({ where: { slug: 'pune-a' }, data: { status: 'SUSPENDED' } })
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(2)
    expect(body.indexable).toBe(false)
  })

  it('is not indexable at two listings', async () => {
    const body = landingPageResponse.parse((await get('/offline-jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(2)
    expect(body.indexable).toBe(false)
  })

  it('is not indexable at one listing', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-mumbai')).body)
    expect(body.listings.total).toBe(1)
    expect(body.indexable).toBe(false)
  })
})

describe('GET /api/v1/landing — canonical', () => {
  it('self-canonicalises an exam and city page', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.canonicalPath).toBe('/jee-coaching-in-pune')
  })

  it('self-canonicalises a mode variant that genuinely narrows', async () => {
    const body = landingPageResponse.parse((await get('/offline-jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(2)
    expect(body.parentTotal).toBe(3)
    expect(body.canonicalPath).toBe('/offline-jee-coaching-in-pune')
  })

  it('canonicalises a mode variant whose set equals its parent', async () => {
    // Every Mumbai JEE institute is online, so the variant is a duplicate.
    const body = landingPageResponse.parse((await get('/online-jee-coaching-in-mumbai')).body)
    expect(body.listings.total).toBe(1)
    expect(body.parentTotal).toBe(1)
    expect(body.canonicalPath).toBe('/jee-coaching-in-mumbai')
  })
})

describe('GET /api/v1/landing — fee stats', () => {
  it('spans the whole set, not the requested page', async () => {
    const res = await testApp().get(
      `/api/v1/landing?path=${encodeURIComponent('/jee-coaching-in-pune')}&limit=1`,
    )
    const body = landingPageResponse.parse(res.body)
    expect(body.listings.items).toHaveLength(1)
    expect(body.feeStats.minFeeAmount).toBe(2_500_000)
    expect(body.feeStats.maxFeeAmount).toBe(15_000_000)
  })

  it('respects the mode filter', async () => {
    const body = landingPageResponse.parse((await get('/online-jee-coaching-in-pune')).body)
    expect(body.feeStats.minFeeAmount).toBe(15_000_000)
  })
})

describe('GET /api/v1/landing — siblings', () => {
  it('lists other exams in the city, excluding the current exam', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.siblings.examsInCity).toEqual([
      { slug: 'neet', label: 'NEET', count: 1, path: '/neet-coaching-in-pune' },
    ])
  })

  it('lists other cities for the exam, excluding the current city', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.siblings.citiesForExam).toEqual([
      { slug: 'mumbai', name: 'Mumbai', count: 1, path: '/jee-coaching-in-mumbai' },
    ])
  })

  it('offers mode variants that narrow, excluding the current mode', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.siblings.modeVariants.map((variant) => variant.mode).sort()).toEqual([
      'OFFLINE',
      'ONLINE',
    ])
    for (const variant of body.siblings.modeVariants) {
      expect(variant.path).toMatch(/-jee-coaching-in-pune$/)
    }
  })

  it('omits a mode variant that would canonicalise away', async () => {
    // Mumbai's only JEE institute is online, so /online-... duplicates the
    // parent and must not be linked from it.
    const body = landingPageResponse.parse((await get('/jee-coaching-in-mumbai')).body)
    expect(body.siblings.modeVariants).toEqual([])
  })

  it('ignores mode when building lateral links', async () => {
    // From the offline variant, siblings still point at parent-level pages.
    const body = landingPageResponse.parse((await get('/offline-jee-coaching-in-pune')).body)
    expect(body.siblings.examsInCity[0]?.path).toBe('/neet-coaching-in-pune')
    expect(body.siblings.citiesForExam[0]?.path).toBe('/jee-coaching-in-mumbai')
  })
})

describe('GET /api/v1/landing/indexable', () => {
  it('returns only paths at or above the threshold', async () => {
    const res = await testApp().get('/api/v1/landing/indexable')
    expect(res.status).toBe(200)
    expect(landingIndexableResponse.parse(res.body).paths).toEqual(['/jee-coaching-in-pune'])
  })

  it('excludes thin combinations that still have pages', async () => {
    const body = landingIndexableResponse.parse(
      (await testApp().get('/api/v1/landing/indexable')).body,
    )
    expect(body.paths).not.toContain('/jee-coaching-in-mumbai')
    expect(body.paths).not.toContain('/neet-coaching-in-pune')
  })
})

describe('GET /api/v1/landing — logos (P2c)', () => {
  it('landing cards carry logoUrl', async () => {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { slug: 'pune-a' } })
    const logo = await prisma.mediaAsset.create({
      data: {
        listingId: listing.id,
        purpose: 'LOGO',
        storageKey: `listings/${listing.id}/logo`,
        width: 256,
        height: 256,
      },
    })
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    const card = body.listings.items.find((item) => item.slug === 'pune-a')
    expect(card?.logoUrl).toBe(`http://localhost:4000/media/${logo.storageKey}-256.webp`)
    expect(body.listings.items.find((item) => item.slug === 'pune-b')?.logoUrl).toBeNull()
  })
})
