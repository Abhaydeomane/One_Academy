import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

test.beforeAll(async () => {
  await truncateAll()

  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'alpha-academy',
      name: 'Alpha Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      organizationId: org.id,
      cityId: city.id,
      shortDescription: 'JEE and NEET coaching',
      instituteProfile: { create: { establishedYear: 2011, modes: ['OFFLINE'] } },
      batches: {
        create: {
          title: 'JEE Advanced 2027',
          exam: 'JEE',
          mode: 'OFFLINE',
          startDate: new Date('2027-04-01T00:00:00Z'),
          seatsTotal: 60,
          seatsAvailable: 18,
          feeAmount: 12_500_000,
          status: 'PUBLISHED',
        },
      },
    },
  })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'secret-academy',
      name: 'Secret Academy',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: city.id,
      instituteProfile: { create: { modes: ['ONLINE'] } },
    },
  })
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('a student browses, opens an institute and submits an enquiry', async ({ page }) => {
  await page.goto('/institutes')
  await expect(page.getByRole('heading', { name: 'Coaching institutes' })).toBeVisible()

  await page.getByRole('link', { name: /Alpha Academy/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha Academy' })).toBeVisible()

  // Scoped to the heading: the batch title also appears as an option in the
  // enquiry form's batch picker.
  await expect(page.getByRole('heading', { name: 'JEE Advanced 2027' })).toBeVisible()
  // Fees are stored as paise and rendered for display (BR-005).
  await expect(page.getByText('₹1,25,000')).toBeVisible()
  await expect(page.getByText('18 of 60 seats left')).toBeVisible()

  await page.getByLabel('Your name').fill('Asha Rao')
  await page.getByLabel('Phone').fill('9876543210')
  await page.getByRole('button', { name: 'Request callback' }).click()

  await expect(page.getByText(/institute will contact you/i)).toBeVisible()

  const enquiry = await prisma.enquiry.findFirstOrThrow()
  expect(enquiry.name).toBe('Asha Rao')
  expect(enquiry.phone).toBe('9876543210')
})

test('a draft listing is not publicly reachable (BR-009)', async ({ page }) => {
  const response = await page.goto('/institutes/secret-academy')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Institute not found')).toBeVisible()
})

test('the sticky mobile call-to-action is present at phone width', async ({ page }) => {
  await page.goto('/institutes/alpha-academy')

  // Two controls share this label: the sticky bar link and the form's submit.
  const stickyCta = page.getByRole('link', { name: 'Request a callback' })
  await expect(stickyCta).toBeVisible()

  const box = await stickyCta.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
})
