import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { prisma, truncateAll } from '../helpers/db.js'

// P2c: a logo and a photo uploaded through the API reach the public pages.

const API = 'http://localhost:4100'
const PARTNER = JSON.stringify({ userId: 'e2e-partner', orgId: 'co_delta', globalRole: 'USER' })
const run = Date.now()
const slug = `delta-academy-${run}`
const name = `Delta Academy ${run}`
let listingId = ''
let photo = { width: 0, height: 0 }

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  await truncateAll()
  const city = await prisma.city.create({
    data: { slug: 'nashik', name: 'Nashik', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({
    data: { name: 'Delta Education', slug: 'delta-education', clerkOrgId: 'co_delta' },
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
      instituteProfile: { create: { modes: ['OFFLINE'] } },
    },
  })
  listingId = listing.id

  const upload = async (purpose: 'LOGO' | 'PHOTO', buffer: Buffer, fileName: string) => {
    const res = await request.post(`${API}/api/v1/partner/listings/${listingId}/media`, {
      headers: { 'x-test-auth': PARTNER },
      multipart: { purpose, file: { name: fileName, mimeType: 'image/jpeg', buffer } },
    })
    expect(res.status()).toBe(201)
    return res.json()
  }

  const jpeg = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#2a6' },
  })
    .jpeg()
    .toBuffer()
  const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#a26' } })
    .png()
    .toBuffer()
  photo = await upload('PHOTO', jpeg, 'classroom.jpg')
  await upload('LOGO', png, 'logo.png')
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('the detail page shows the photo strip with explicit dimensions', async ({ page }) => {
  await page.goto(`/institutes/${slug}`)
  const img = page.locator('img[srcset]').first()
  await expect(img).toBeVisible()
  await expect(img).toHaveAttribute('width', String(photo.width))
  await expect(img).toHaveAttribute('height', String(photo.height))
})

test('the search card shows the logo', async ({ page }) => {
  const logoLoaded = page.waitForResponse((res) => res.url().endsWith('-256.webp'))
  await page.goto('/institutes')
  const logo = page.locator('img[src$="-256.webp"]').first()
  await expect(logo).toBeVisible()
  expect((await logoLoaded).status()).toBe(200)
})

test('the detail page JSON-LD carries logo and image', async ({ page }) => {
  await page.goto(`/institutes/${slug}`)
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
  )
  expect(jsonLd.logo).toMatch(/-256\.webp$/)
  expect(jsonLd.image).toEqual([expect.stringMatching(/-1600\.webp$/)])
})
