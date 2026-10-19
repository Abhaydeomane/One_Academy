import { describe, expect, it } from 'vitest'
import {
  compareQuery,
  createBatchBody,
  createEnquiryBody,
  facetCounts,
  FEE_BUCKETS,
  instituteListResponse,
  instituteSummary,
  listInstitutesQuery,
  rejectListingBody,
  updateListingBody,
  suspendListingBody,
} from './index.js'

describe('listInstitutesQuery', () => {
  it('defaults pagination and leaves sort undefined for the service to resolve', () => {
    expect(listInstitutesQuery.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('accepts city, exams and mode filters', () => {
    const parsed = listInstitutesQuery.parse({ city: 'pune', exams: ['jee'], mode: 'OFFLINE' })
    expect(parsed.city).toBe('pune')
    expect(parsed.exams).toEqual(['jee'])
    expect(parsed.mode).toBe('OFFLINE')
  })

  it('rejects an unknown mode', () => {
    expect(listInstitutesQuery.safeParse({ mode: 'REMOTE' }).success).toBe(false)
  })

  it('accepts a free-text query and trims it', () => {
    expect(listInstitutesQuery.parse({ q: '  allen pune  ' }).q).toBe('allen pune')
  })

  it('rejects a query longer than 100 characters', () => {
    expect(listInstitutesQuery.safeParse({ q: 'a'.repeat(101) }).success).toBe(false)
  })

  it('wraps a single repeated parameter into an array', () => {
    expect(listInstitutesQuery.parse({ exams: 'jee' }).exams).toEqual(['jee'])
  })

  it('keeps multiple repeated parameters as an array', () => {
    expect(listInstitutesQuery.parse({ exams: ['jee', 'neet'] }).exams).toEqual(['jee', 'neet'])
  })

  it('rejects more than ten exams', () => {
    const exams = Array.from({ length: 11 }, (_, index) => `exam-${index}`)
    expect(listInstitutesQuery.safeParse({ exams }).success).toBe(false)
  })

  it('coerces fee bounds from query strings', () => {
    const parsed = listInstitutesQuery.parse({ feeMin: '2500000', feeMax: '5000000' })
    expect(parsed.feeMin).toBe(2500000)
    expect(parsed.feeMax).toBe(5000000)
  })

  it('rejects a fee range whose minimum exceeds its maximum', () => {
    expect(listInstitutesQuery.safeParse({ feeMin: '5000000', feeMax: '1000' }).success).toBe(false)
  })

  it('rejects a non-integer fee bound, because fees are minor units (BR-005)', () => {
    expect(listInstitutesQuery.safeParse({ feeMin: '100.5' }).success).toBe(false)
  })

  it('accepts every supported sort value', () => {
    for (const sort of ['relevance', 'recent', 'fee_asc', 'name']) {
      expect(listInstitutesQuery.safeParse({ sort }).success).toBe(true)
    }
  })

  it('no longer accepts sort=rating, which was inert', () => {
    expect(listInstitutesQuery.safeParse({ sort: 'rating' }).success).toBe(false)
  })
})

describe('facetCounts', () => {
  it('validates exam and mode counts', () => {
    const value = {
      exams: [{ slug: 'jee', label: 'JEE', count: 12 }],
      modes: [{ mode: 'OFFLINE' as const, count: 7 }],
    }
    expect(facetCounts.parse(value)).toEqual(value)
  })

  it('rejects an unknown mode in a facet', () => {
    expect(
      facetCounts.safeParse({ exams: [], modes: [{ mode: 'REMOTE', count: 1 }] }).success,
    ).toBe(false)
  })
})

describe('instituteSummary — fee range', () => {
  const base = {
    id: 'l1',
    slug: 'alpha',
    name: 'Alpha',
    city: { slug: 'pune', name: 'Pune' },
    locality: null,
    shortDescription: null,
    ratingAvg: 0,
    ratingCount: 0,
    modes: [],
    exams: [],
    batchCount: 0,
    logoUrl: null,
  }

  it('accepts a null fee range for a listing with no published batches', () => {
    const parsed = instituteSummary.parse({ ...base, minFeeAmount: null, maxFeeAmount: null })
    expect(parsed.minFeeAmount).toBeNull()
  })

  it('requires integer minor units for the fee range (BR-005)', () => {
    expect(
      instituteSummary.safeParse({ ...base, minFeeAmount: 1000.5, maxFeeAmount: 2000 }).success,
    ).toBe(false)
  })
})

describe('instituteListResponse', () => {
  it('carries facets alongside the paginated items', () => {
    const value = { items: [], total: 0, page: 1, limit: 20, facets: { exams: [], modes: [] } }
    expect(instituteListResponse.parse(value)).toEqual(value)
  })

  it('rejects a response with no facets', () => {
    expect(
      instituteListResponse.safeParse({ items: [], total: 0, page: 1, limit: 20 }).success,
    ).toBe(false)
  })
})

describe('FEE_BUCKETS', () => {
  it('covers the range without gaps, in paise', () => {
    expect(FEE_BUCKETS.map((bucket) => bucket.id)).toEqual([
      'under-25k',
      '25k-50k',
      '50k-1l',
      'over-1l',
    ])
    expect(FEE_BUCKETS[0]?.feeMax).toBe(2_500_000)
    expect(FEE_BUCKETS[1]?.feeMin).toBe(2_500_000)
    expect(FEE_BUCKETS[3]?.feeMin).toBe(10_000_000)
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

  it('accepts only http(s) websites', () => {
    expect(updateListingBody.safeParse({ website: 'https://example.com' }).success).toBe(true)
    expect(updateListingBody.safeParse({ website: 'javascript:alert(1)' }).success).toBe(false)
    expect(updateListingBody.safeParse({ website: 'data:text/html,x' }).success).toBe(false)
  })
})

describe('compareQuery', () => {
  // A lone slug is coerced to an array and then rejected by BR-008, not by
  // the array type check — so the failure must come from the refine, which is
  // what proves the coercion ran at all.
  it('coerces a single slug into an array, then rejects it as too few', () => {
    const result = compareQuery.safeParse({ slug: 'allen' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('between 2 and 4')
  })

  it('accepts repeated slugs', () => {
    expect(compareQuery.parse({ slug: ['allen', 'aakash'] }).slug).toEqual(['allen', 'aakash'])
  })

  // De-duplication happens before the count check, so a doubled checkbox
  // value cannot push a legitimate pair over the limit.
  it('rejects fewer than two distinct slugs', () => {
    expect(compareQuery.safeParse({ slug: ['allen', 'allen'] }).success).toBe(false)
  })

  it('rejects more than four', () => {
    expect(compareQuery.safeParse({ slug: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false)
  })

  it('accepts exactly two and exactly four', () => {
    expect(compareQuery.safeParse({ slug: ['a', 'b'] }).success).toBe(true)
    expect(compareQuery.safeParse({ slug: ['a', 'b', 'c', 'd'] }).success).toBe(true)
  })

  it('coerces a single batch pin into an array', () => {
    expect(compareQuery.parse({ slug: ['a', 'b'], batch: 'a:b1' }).batch).toEqual(['a:b1'])
  })
})

describe('rejectListingBody (BR-014)', () => {
  it('trims before checking the minimum', () => {
    expect(rejectListingBody.safeParse({ reason: '   too short  ' }).success).toBe(false)
  })

  it('accepts and trims a real reason', () => {
    expect(rejectListingBody.parse({ reason: '  Phone number did not answer  ' }).reason).toBe(
      'Phone number did not answer',
    )
  })

  it('rejects more than 500 characters', () => {
    expect(rejectListingBody.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('suspendListingBody (BR-015)', () => {
  it('trims and bounds the reason', () => {
    expect(suspendListingBody.safeParse({ reason: `  ${'a'.repeat(9)}  ` }).success).toBe(false)
    expect(suspendListingBody.parse({ reason: `  ${'a'.repeat(10)}  ` }).reason).toBe(
      'a'.repeat(10),
    )
    expect(suspendListingBody.safeParse({ reason: 'a'.repeat(501) }).success).toBe(false)
  })
})
