import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { enquiryCreatedResponse } from '@one/shared'
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

const valid = () => ({ listingSlug: seed.publishedSlug, name: 'Asha Rao', phone: '9876543210' })

describe('POST /api/v1/enquiries', () => {
  it('creates an enquiry against a published listing', async () => {
    const res = await testApp().post('/api/v1/enquiries').send(valid())
    expect(res.status).toBe(201)
    const body = enquiryCreatedResponse.parse(res.body)
    expect(body.status).toBe('NEW')

    const stored = await prisma.enquiry.findUniqueOrThrow({ where: { id: body.id } })
    expect(stored.listingId).toBe(seed.publishedListingId)
    expect(stored.vertical).toBe('INSTITUTE')
  })

  it('rejects a malformed phone number with VALIDATION_FAILED', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), phone: '123' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a missing name', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ listingSlug: seed.publishedSlug, phone: '9876543210' })
    expect(res.status).toBe(400)
  })

  it('404s an enquiry against a draft listing (BR-009)', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), listingSlug: seed.draftSlug })
    expect(res.status).toBe(404)
    expect(await prisma.enquiry.count()).toBe(0)
  })

  it('accepts an optional batch id belonging to the listing', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), batchId: seed.publishedBatchId })
    expect(res.status).toBe(201)

    const stored = await prisma.enquiry.findFirstOrThrow()
    expect(stored.batchId).toBe(seed.publishedBatchId)
  })

  it('rejects a batch id belonging to a different listing', async () => {
    const otherListing = await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'other-academy',
        name: 'Other',
        status: 'PUBLISHED',
        organizationId: seed.orgId,
        cityId: seed.cityId,
      },
    })
    const foreignBatch = await prisma.batch.create({
      data: {
        listingId: otherListing.id,
        title: 'Foreign',
        exam: 'JEE',
        startDate: new Date('2027-04-01T00:00:00Z'),
        seatsTotal: 10,
        seatsAvailable: 10,
        feeAmount: 1000,
        status: 'PUBLISHED',
      },
    })

    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), batchId: foreignBatch.id })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(await prisma.enquiry.count()).toBe(0)
  })
})
