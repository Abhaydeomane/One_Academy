import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

// The P0 acceptance criterion, executed: a partner creates a batch, an admin
// publishes the listing, and only then does any of it reach the public site.

const API = 'http://localhost:4100'
const ADMIN = JSON.stringify({ userId: 'e2e-admin', globalRole: 'ADMIN' })
const PARTNER = JSON.stringify({ userId: 'e2e-partner', orgId: 'co_e2e', globalRole: 'USER' })

let listingId = ''

// A fresh slug per run. Next's ISR fetch cache persists in .next/cache across
// runs, so a slug reused from an earlier run can be served from that cache and
// mask the status change this spec is asserting.
const slug = `beta-coaching-centre-${Date.now()}`

test.beforeAll(async () => {
  await truncateAll()

  const city = await prisma.city.create({
    data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({
    data: { name: 'Beta Coaching', slug: 'beta-coaching', clerkOrgId: 'co_e2e' },
  })

  const exam = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  const listing = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug,
      name: 'Beta Coaching Centre',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: city.id,
      shortDescription: 'New centre awaiting review',
      address: '5 Linking Road, Bandra, Mumbai 400050',
      contactPhone: '9000000002',
      tags: { create: [{ tagId: exam.id }] },
      instituteProfile: { create: { modes: ['HYBRID'] } },
    },
  })
  listingId = listing.id
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('partner creates a batch, admin publishes, and it appears publicly', async ({
  request,
  page,
}) => {
  const headers = { 'x-test-auth': PARTNER, 'content-type': 'application/json' }

  const created = await request.post(`${API}/api/v1/partner/listings/${listingId}/batches`, {
    headers,
    data: {
      title: 'NEET 2028 Foundation',
      exam: 'NEET',
      mode: 'HYBRID',
      startDate: '2028-03-01',
      seatsTotal: 40,
      feeAmount: 8_800_000,
    },
  })
  expect(created.status()).toBe(201)
  const batchId = (await created.json()).id as string

  const submitted = await request.post(`${API}/api/v1/partner/listings/${listingId}/submit`, {
    headers,
  })
  expect(submitted.status()).toBe(200)
  expect((await submitted.json()).status).toBe('PENDING_REVIEW')

  // Still invisible: submitted is not published.
  const beforePublish = await page.goto(`/institutes/${slug}`)
  expect(beforePublish?.status()).toBe(404)

  // BR-004: a batch cannot be published while its listing is not.
  const tooEarly = await request.patch(`${API}/api/v1/partner/batches/${batchId}`, {
    headers,
    data: { status: 'PUBLISHED' },
  })
  expect(tooEarly.status()).toBe(409)
  expect((await tooEarly.json()).error.code).toBe('BATCH_PARENT_NOT_PUBLISHED')

  // BR-001: a partner cannot publish their own listing.
  const asPartner = await request.post(`${API}/api/v1/admin/listings/${listingId}/publish`, {
    headers,
  })
  expect(asPartner.status()).toBe(403)

  const published = await request.post(`${API}/api/v1/admin/listings/${listingId}/publish`, {
    headers: { 'x-test-auth': ADMIN, 'content-type': 'application/json' },
  })
  expect(published.status()).toBe(200)

  const batchPublished = await request.patch(`${API}/api/v1/partner/batches/${batchId}`, {
    headers,
    data: { status: 'PUBLISHED' },
  })
  expect(batchPublished.status()).toBe(200)

  await page.goto(`/institutes/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Beta Coaching Centre' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'NEET 2028 Foundation' })).toBeVisible()
  await expect(page.getByText('₹88,000')).toBeVisible()
})

test('a self-registered institute is rejected once, then published and verified', async ({
  request,
  page,
}) => {
  // Stands in for the organization.created webhook; the e2e API has no Clerk.
  const org = await prisma.organization.create({
    data: { name: 'Gamma Group', slug: 'gamma-group', clerkOrgId: 'co_e2e_gamma' },
  })
  const headers = {
    'x-test-auth': JSON.stringify({
      userId: 'e2e-gamma',
      orgId: 'co_e2e_gamma',
      globalRole: 'USER',
    }),
    'content-type': 'application/json',
  }
  const adminHeaders = { 'x-test-auth': ADMIN, 'content-type': 'application/json' }
  const name = `Gamma Classes ${Date.now()}`

  const created = await request.post(`${API}/api/v1/partner/listings`, {
    headers,
    data: { name, citySlug: 'mumbai', status: 'PUBLISHED' },
  })
  expect(created.status()).toBe(201)
  const listing = await created.json()
  expect(listing.status).toBe('DRAFT')

  const incomplete = await request.post(`${API}/api/v1/partner/listings/${listing.id}/submit`, {
    headers,
  })
  expect(incomplete.status()).toBe(409)
  expect((await incomplete.json()).error.details.missing).toEqual([
    'address',
    'contactPhone',
    'exams',
  ])

  const filled = await request.patch(`${API}/api/v1/partner/listings/${listing.id}`, {
    headers,
    data: {
      address: '7 Hill Road, Bandra West, Mumbai 400050',
      contactPhone: '9988776655',
      examSlugs: ['neet'],
    },
  })
  expect(filled.status()).toBe(200)

  expect(
    (
      await request.post(`${API}/api/v1/partner/listings/${listing.id}/submit`, { headers })
    ).status(),
  ).toBe(200)

  const rejected = await request.post(`${API}/api/v1/admin/listings/${listing.id}/reject`, {
    headers: adminHeaders,
    data: { reason: 'The phone number did not answer.' },
  })
  expect(rejected.status()).toBe(200)

  const asPartner = await request.get(`${API}/api/v1/partner/listings/${listing.id}`, { headers })
  expect(await asPartner.json()).toMatchObject({
    status: 'DRAFT',
    rejectionReason: 'The phone number did not answer.',
  })

  expect(
    (
      await request.post(`${API}/api/v1/partner/listings/${listing.id}/submit`, { headers })
    ).status(),
  ).toBe(200)

  const published = await request.post(`${API}/api/v1/admin/listings/${listing.id}/publish`, {
    headers: adminHeaders,
  })
  expect(published.status()).toBe(200)

  const verified = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
  expect(verified.verifiedAt).not.toBeNull()
  expect(verified.verifiedByClerkUserId).toBe('e2e-admin')

  await page.goto(`/institutes/${listing.slug}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText('7 Hill Road, Bandra West, Mumbai 400050')).toBeVisible()
  expect(await page.content()).not.toContain('9988776655')
})
