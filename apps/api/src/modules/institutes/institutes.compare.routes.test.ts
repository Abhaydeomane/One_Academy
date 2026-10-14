import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { compareResponse } from '@one/shared'
import { resetDb } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

const FUTURE = new Date('2030-04-01T00:00:00Z')
const LATER = new Date('2030-09-01T00:00:00Z')
const PAST = new Date('2020-04-01T00:00:00Z')

let alphaDearId = ''
let betaBatchId = ''
let draftBatchElsewhereId = ''

/// Alpha has two upcoming batches (₹30,000 and ₹80,000) plus one that already
/// started, so it exercises both the default pin and the upcoming filter. Beta
/// has one. Alpha also carries a former slug, for the canonical path.
beforeEach(async () => {
  await resetDb()

  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Org', slug: 'org' } })

  const make = (slug: string, name: string, status: 'PUBLISHED' | 'DRAFT') =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date('2026-01-01T00:00:00Z') : null,
        organizationId: org.id,
        cityId: city.id,
        locality: 'Kothrud',
        instituteProfile: {
          create: { establishedYear: 2011, facultyCount: 24, modes: ['OFFLINE'] },
        },
      },
    })

  const alpha = await make('alpha', 'Alpha Academy', 'PUBLISHED')
  const beta = await make('beta', 'Beta Academy', 'PUBLISHED')
  const draft = await make('draft-academy', 'Draft Academy', 'DRAFT')

  const batch = (
    listingId: string,
    title: string,
    feeAmount: number,
    startDate: Date,
    status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
  ) =>
    prisma.batch.create({
      data: {
        listingId,
        title,
        exam: 'JEE',
        mode: 'OFFLINE',
        startDate,
        seatsTotal: 30,
        seatsAvailable: 10,
        feeAmount,
        status,
      },
    })

  await batch(alpha.id, 'Alpha cheap', 3_000_000, FUTURE)
  alphaDearId = (await batch(alpha.id, 'Alpha dear', 8_000_000, LATER)).id
  await batch(alpha.id, 'Alpha already started', 100_000, PAST)
  betaBatchId = (await batch(beta.id, 'Beta only', 5_000_000, FUTURE)).id
  draftBatchElsewhereId = (await batch(draft.id, 'Draft batch', 1_000, FUTURE, 'DRAFT')).id

  await prisma.listingRedirect.create({ data: { oldSlug: 'alpha-old', listingId: alpha.id } })
})

afterAll(async () => {
  await prisma.$disconnect()
})

const get = (qs: string) => testApp().get(`/api/v1/compare?${qs}`)

describe('GET /api/v1/compare', () => {
  it('returns one column per slug, pinning the cheapest upcoming batch', async () => {
    const res = await get('slug=alpha&slug=beta')

    expect(res.status).toBe(200)
    // The contract is the contract: parse rather than spot-check.
    const body = compareResponse.parse(res.body)

    expect(body.columns).toHaveLength(2)
    expect(body.columns[0]?.pinned?.title).toBe('Alpha cheap')
    expect(body.columns[0]?.pinFellBack).toBe(false)
    // The already-started batch is excluded from both the options and the count.
    expect(body.columns[0]?.institute.batchCount).toBe(2)
    expect(body.columns[0]?.batches.map((batch) => batch.title)).toEqual([
      'Alpha cheap',
      'Alpha dear',
    ])
    expect(body.dropped).toEqual([])
  })

  it('carries the institute facts the batch rows cannot supply', async () => {
    const res = await get('slug=alpha&slug=beta')
    const institute = res.body.columns[0].institute

    expect(institute).toMatchObject({
      slug: 'alpha',
      name: 'Alpha Academy',
      locality: 'Kothrud',
      establishedYear: 2011,
      facultyCount: 24,
      city: { slug: 'pune', name: 'Pune' },
    })
  })

  it('honours an explicit pin', async () => {
    const res = await get(`slug=alpha&slug=beta&batch=alpha:${alphaDearId}`)

    expect(res.body.columns[0].pinned.title).toBe('Alpha dear')
    expect(res.body.columns[0].pinFellBack).toBe(false)
  })

  it('falls back and reports it when a pin no longer qualifies', async () => {
    const res = await get('slug=alpha&slug=beta&batch=alpha:nonexistent-id')

    expect(res.status).toBe(200)
    expect(res.body.columns[0].pinned.title).toBe('Alpha cheap')
    expect(res.body.columns[0].pinFellBack).toBe(true)
  })

  it('rejects a pin naming another institute published batch', async () => {
    const res = await get(`slug=alpha&slug=beta&batch=alpha:${betaBatchId}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  // Treated as rot, not confirmed as tampering: distinguishing it would leak
  // the existence of unpublished content.
  it('falls back for a pin naming an unpublished batch elsewhere', async () => {
    const res = await get(`slug=alpha&slug=beta&batch=alpha:${draftBatchElsewhereId}`)

    expect(res.status).toBe(200)
    expect(res.body.columns[0].pinFellBack).toBe(true)
  })

  it('rejects a malformed pin', async () => {
    expect((await get('slug=alpha&slug=beta&batch=garbage')).status).toBe(400)
  })

  it('drops an unknown slug but still renders', async () => {
    const res = await get('slug=alpha&slug=beta&slug=ghost')

    expect(res.status).toBe(200)
    expect(res.body.columns).toHaveLength(2)
    expect(res.body.dropped).toEqual([{ slug: 'ghost', reason: 'NOT_FOUND' }])
  })

  it('never shows a DRAFT listing (BR-009)', async () => {
    const res = await get('slug=alpha&slug=beta&slug=draft-academy')

    expect(res.body.columns).toHaveLength(2)
    expect(res.body.dropped).toEqual([{ slug: 'draft-academy', reason: 'NOT_FOUND' }])
  })

  it('404s when fewer than two slugs survive', async () => {
    expect((await get('slug=alpha&slug=ghost-one&slug=ghost-two')).status).toBe(404)
  })

  it('resolves a former slug into canonicalSlugs without redirecting', async () => {
    const res = await get('slug=alpha-old&slug=beta')

    expect(res.status).toBe(200)
    expect(res.body.canonicalSlugs).toEqual(['alpha', 'beta'])
  })

  it('keeps a pin attached when its slug was a former name', async () => {
    const res = await get(`slug=alpha-old&slug=beta&batch=alpha-old:${alphaDearId}`)

    expect(res.body.columns[0].pinned.title).toBe('Alpha dear')
    expect(res.body.columns[0].pinFellBack).toBe(false)
  })

  it('rejects fewer than two and more than four slugs (BR-008)', async () => {
    expect((await get('slug=alpha')).status).toBe(400)
    expect((await get('slug=a&slug=b&slug=c&slug=d&slug=e')).status).toBe(400)
  })

  it('de-duplicates before counting, so a doubled slug is still too few', async () => {
    expect((await get('slug=alpha&slug=alpha')).status).toBe(400)
  })

  it('returns pinned: null for an institute with no upcoming batch', async () => {
    const city = await prisma.city.findFirstOrThrow()
    const org = await prisma.organization.findFirstOrThrow()
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'batchless',
        name: 'Batchless Academy',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        organizationId: org.id,
        cityId: city.id,
        instituteProfile: { create: { modes: ['ONLINE'] } },
      },
    })

    const res = await get('slug=alpha&slug=batchless')
    const column = res.body.columns.find(
      (candidate: { institute: { slug: string } }) => candidate.institute.slug === 'batchless',
    )

    expect(column.pinned).toBeNull()
    expect(column.batches).toEqual([])
    expect(column.institute.batchCount).toBe(0)
  })
})
