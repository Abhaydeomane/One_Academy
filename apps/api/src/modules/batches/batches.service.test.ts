import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { createForOrg, listUpcomingPublishedForListing, updateForOrg } from './batches.service.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const future = new Date('2027-09-01T00:00:00Z')
const past = new Date('2020-01-01T00:00:00Z')

const body = (overrides: Record<string, unknown> = {}) => ({
  title: 'New Batch',
  exam: 'JEE',
  mode: 'ONLINE' as const,
  startDate: future,
  seatsTotal: 30,
  feeAmount: 500000,
  feeCurrency: 'INR',
  ...overrides,
})

describe('createForOrg', () => {
  it('creates a DRAFT batch defaulting seatsAvailable to seatsTotal', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body())
    expect(created.seatsAvailable).toBe(30)

    const row = await prisma.batch.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('DRAFT')
  })

  it("forbids creating on another organisation's listing", async () => {
    await expect(
      createForOrg(seed.publishedListingId, seed.otherOrgId, body()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects seatsAvailable above seatsTotal (BR-010)', async () => {
    await expect(
      createForOrg(seed.publishedListingId, seed.orgId, body({ seatsAvailable: 31 })),
    ).rejects.toMatchObject({ code: 'SEATS_OUT_OF_RANGE' })
  })
})

describe('updateForOrg publishing rules', () => {
  it('refuses to publish a batch starting in the past (BR-003)', async () => {
    const created = await createForOrg(
      seed.publishedListingId,
      seed.orgId,
      body({ startDate: past }),
    )
    await expect(
      updateForOrg(created.id, seed.orgId, { status: 'PUBLISHED' }),
    ).rejects.toMatchObject({ code: 'BATCH_START_DATE_PAST' })
  })

  it('refuses to publish when the parent listing is not PUBLISHED (BR-004)', async () => {
    const created = await createForOrg(seed.draftListingId, seed.orgId, body())
    await expect(
      updateForOrg(created.id, seed.orgId, { status: 'PUBLISHED' }),
    ).rejects.toMatchObject({ code: 'BATCH_PARENT_NOT_PUBLISHED' })
  })

  it('publishes a future batch on a published listing', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body())
    const updated = await updateForOrg(created.id, seed.orgId, { status: 'PUBLISHED' })
    expect(updated.status).toBe('PUBLISHED')
  })

  it('rejects an update that would break the seats invariant (BR-010)', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body())
    await expect(updateForOrg(created.id, seed.orgId, { seatsTotal: 10 })).rejects.toMatchObject({
      code: 'SEATS_OUT_OF_RANGE',
    })
  })

  it("forbids updating another organisation's batch", async () => {
    await expect(
      updateForOrg(seed.publishedBatchId, seed.otherOrgId, { title: 'Hijacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('404s an unknown batch', async () => {
    await expect(updateForOrg('missing', seed.orgId, { title: 'Nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('listUpcomingPublishedForListing', () => {
  const batch = (overrides: Record<string, unknown>) =>
    prisma.batch.create({
      data: {
        listingId: seed.publishedListingId,
        exam: 'JEE',
        mode: 'ONLINE',
        seatsTotal: 30,
        seatsAvailable: 30,
        feeCurrency: 'INR',
        ...overrides,
      } as never,
    })

  it('excludes past and DRAFT batches, cheapest upcoming first', async () => {
    await batch({ title: 'Past cheap', startDate: past, feeAmount: 100000, status: 'PUBLISHED' })
    await batch({
      title: 'Future dear',
      startDate: future,
      feeAmount: 9000000,
      status: 'PUBLISHED',
    })
    await batch({
      title: 'Future cheap',
      startDate: new Date('2027-12-01T00:00:00Z'),
      feeAmount: 3000000,
      status: 'PUBLISHED',
    })
    await batch({ title: 'Future draft', startDate: future, feeAmount: 100, status: 'DRAFT' })

    const rows = await listUpcomingPublishedForListing(seed.publishedListingId)

    // Past gone, DRAFT gone, and the cheapest upcoming batch leads so the
    // caller can take [0] as the default pin. 'JEE 2027' is seedMinimal's own
    // published batch at ₹1,25,000 — the dearest, so it sorts last.
    expect(rows.map((row) => row.title)).toEqual(['Future cheap', 'Future dear', 'JEE 2027'])
  })

  it('returns an empty list when every published batch has started', async () => {
    await prisma.batch.deleteMany({ where: { listingId: seed.publishedListingId } })
    await batch({ title: 'Past', startDate: past, feeAmount: 100000, status: 'PUBLISHED' })

    expect(await listUpcomingPublishedForListing(seed.publishedListingId)).toEqual([])
  })
})
