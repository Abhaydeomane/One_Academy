import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { createForOrg, updateForOrg } from './batches.service.js'

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
