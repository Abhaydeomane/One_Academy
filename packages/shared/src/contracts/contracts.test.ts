import { describe, expect, it } from 'vitest'
import {
  createBatchBody,
  createEnquiryBody,
  listInstitutesQuery,
  updateListingBody,
} from './index.js'

describe('listInstitutesQuery', () => {
  it('defaults pagination and sort, leaving filters undefined', () => {
    expect(listInstitutesQuery.parse({})).toEqual({ page: 1, limit: 20, sort: 'recent' })
  })

  it('accepts city, exam and mode filters', () => {
    const parsed = listInstitutesQuery.parse({ city: 'pune', exam: 'jee', mode: 'OFFLINE' })
    expect(parsed.city).toBe('pune')
    expect(parsed.mode).toBe('OFFLINE')
  })

  it('rejects an unknown mode', () => {
    expect(listInstitutesQuery.safeParse({ mode: 'REMOTE' }).success).toBe(false)
  })
})

describe('createEnquiryBody', () => {
  it('requires a listing slug, name and phone', () => {
    expect(createEnquiryBody.safeParse({ listingSlug: 'a', name: 'Bee' }).success).toBe(false)
  })

  it('accepts a minimal valid enquiry', () => {
    const parsed = createEnquiryBody.parse({
      listingSlug: 'alpha-academy',
      name: 'Asha',
      phone: '9876543210',
    })
    expect(parsed.phone).toBe('9876543210')
  })

  it('rejects a phone number that is not 10 digits', () => {
    expect(
      createEnquiryBody.safeParse({ listingSlug: 'a', name: 'Bee', phone: '123' }).success,
    ).toBe(false)
  })
})

describe('createBatchBody', () => {
  const base = {
    title: 'Test batch',
    exam: 'JEE',
    mode: 'ONLINE' as const,
    startDate: '2027-04-01',
    seatsTotal: 10,
  }

  it('rejects a negative fee', () => {
    expect(createBatchBody.safeParse({ ...base, feeAmount: -1 }).success).toBe(false)
  })

  it('rejects a non-integer fee, because fees are minor units (BR-005)', () => {
    expect(createBatchBody.safeParse({ ...base, feeAmount: 100.5 }).success).toBe(false)
  })

  it('accepts a valid batch, defaults the currency and coerces the date', () => {
    const parsed = createBatchBody.parse({ ...base, feeAmount: 500000 })
    expect(parsed.feeCurrency).toBe('INR')
    expect(parsed.startDate).toBeInstanceOf(Date)
  })
})

describe('updateListingBody', () => {
  it('rejects an empty object, since a patch must change something', () => {
    expect(updateListingBody.safeParse({}).success).toBe(false)
  })

  it('accepts a partial update', () => {
    const parsed = updateListingBody.parse({ shortDescription: 'New' })
    expect(parsed.shortDescription).toBe('New')
  })

  it('rejects a malformed website URL', () => {
    expect(updateListingBody.safeParse({ website: 'not-a-url' }).success).toBe(false)
  })
})
