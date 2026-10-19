import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

// REQ-002: a suspension must disappear from the public site on the very next
// request, not after the 300-second cache. Runs against the caching web server
// on :3200 (see playwright.config.ts); the first test proves it really caches.

const API = 'http://localhost:4100'
const WEB = 'http://localhost:3200'
const ADMIN = JSON.stringify({ userId: 'e2e-admin', globalRole: 'ADMIN' })

// A fresh slug and name per run, so nothing cached by an earlier run can answer.
const run = Date.now()
const slug = `gamma-classes-${run}`
const name = `Gamma Classes ${run}`
let listingId = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  await truncateAll()
  // .next-e2e-cached outlives a run, and truncating the database does not
  // touch it: start from an empty cache, through the same endpoint the API uses.
  const cleared = await request.post(`${WEB}/api/revalidate`, {
    headers: { 'x-revalidate-secret': process.env.E2E_REVALIDATE_SECRET ?? '' },
  })
  expect(cleared.status()).toBe(200)

  const city = await prisma.city.create({
    data: { slug: 'nagpur', name: 'Nagpur', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({
    data: { name: 'Gamma Education', slug: 'gamma-education', clerkOrgId: 'co_gamma' },
  })
  const listing = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug,
      name,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-05-01T00:00:00Z'),
      firstPublishedAt: new Date('2026-05-01T00:00:00Z'),
      organizationId: org.id,
      cityId: city.id,
      shortDescription: 'JEE coaching in Dharampeth',
      instituteProfile: { create: { modes: ['OFFLINE'] } },
      batches: {
        create: {
          title: 'JEE 2028',
          exam: 'JEE',
          mode: 'OFFLINE',
          startDate: new Date('2028-04-01T00:00:00Z'),
          seatsTotal: 40,
          seatsAvailable: 40,
          feeAmount: 9_000_000,
          status: 'PUBLISHED',
        },
      },
    },
  })
  listingId = listing.id
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('the cache is on: a direct database edit is not visible', async ({ page }) => {
  await page.goto(`${WEB}/institutes/${slug}`)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()

  // Bypasses the API, so nothing revalidates: the cached page must still show
  // the old name. If this fails, caching is off and the tests below prove nothing.
  await prisma.listing.update({ where: { id: listingId }, data: { name: `${name} Renamed` } })
  await page.goto(`${WEB}/institutes/${slug}`)
  await expect(page.getByRole('heading', { name, level: 1, exact: true })).toBeVisible()
})

test('suspending removes the listing on the next request', async ({ page, request }) => {
  // Not cached before, so this shows the rename; match the stem.
  await page.goto(`${WEB}/institutes`)
  await expect(page.getByText(name).first()).toBeVisible()

  const res = await request.post(`${API}/api/v1/admin/listings/${listingId}/suspend`, {
    headers: { 'x-test-auth': ADMIN, 'content-type': 'application/json' },
    data: { reason: 'Reported as a fraudulent institute' },
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).publicCacheCleared).toBe(true)

  const detail = await page.goto(`${WEB}/institutes/${slug}`)
  expect(detail?.status()).toBe(404)
  await expect(page.getByText('Institute not found')).toBeVisible()

  await page.goto(`${WEB}/institutes`)
  await expect(page.getByText(name)).toHaveCount(0)
})

test('reinstating brings it back on the next request', async ({ page, request }) => {
  const res = await request.post(`${API}/api/v1/admin/listings/${listingId}/reinstate`, {
    headers: { 'x-test-auth': ADMIN },
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).publicCacheCleared).toBe(true)

  const detail = await page.goto(`${WEB}/institutes/${slug}`)
  expect(detail?.status()).toBe(200)
  // The revalidated page reads the database afresh, so it carries the rename.
  await expect(page.getByRole('heading', { name: `${name} Renamed`, level: 1 })).toBeVisible()
})
