import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

test.beforeAll(async () => {
  await truncateAll()

  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
  const neet = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-career-institute',
      name: 'Allen Career Institute',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
      locality: 'Kothrud',
      shortDescription: 'JEE coaching since 1988',
      instituteProfile: { create: { modes: ['OFFLINE'] } },
      tags: { create: [{ tagId: jee.id }] },
      batches: {
        create: {
          title: 'JEE Advanced 2028',
          exam: 'JEE',
          mode: 'OFFLINE',
          startDate: new Date('2028-04-01T00:00:00Z'),
          seatsTotal: 40,
          seatsAvailable: 12,
          feeAmount: 2_500_000,
          status: 'PUBLISHED',
        },
      },
    },
  })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'medico-classes',
      name: 'Medico Classes',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-04-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
      locality: 'Baner',
      shortDescription: 'NEET preparation',
      instituteProfile: { create: { modes: ['ONLINE'] } },
      tags: { create: [{ tagId: neet.id }] },
      batches: {
        create: {
          title: 'NEET 2028',
          exam: 'NEET',
          mode: 'ONLINE',
          startDate: new Date('2028-05-01T00:00:00Z'),
          seatsTotal: 30,
          seatsAvailable: 30,
          feeAmount: 9_000_000,
          status: 'PUBLISHED',
        },
      },
    },
  })
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('a student searches by name and finds the institute', async ({ page }) => {
  await page.goto('/institutes')
  await expect(page.getByRole('heading', { name: 'Coaching institutes' })).toBeVisible()

  await page.getByLabel('Search institutes').fill('allen')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/q=allen/)
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Medico Classes/ })).toHaveCount(0)
})

test('searching by locality finds the institute', async ({ page }) => {
  await page.goto('/institutes?q=kothrud')
  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
})

test('filter chips carry counts and narrow the results', async ({ page }) => {
  await page.goto('/institutes')

  // Counts come from the facet aggregates, not from the current page of results.
  await expect(page.getByRole('link', { name: /JEE \(1\)/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /NEET \(1\)/ })).toBeVisible()

  await page.getByRole('link', { name: /NEET \(1\)/ }).click()

  await expect(page).toHaveURL(/exams=neet/)
  await expect(page.getByRole('link', { name: /Medico Classes/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toHaveCount(0)

  // The selected facet still reports the other option's count, so the user is
  // never stranded in a dead end.
  await expect(page.getByRole('link', { name: /JEE \(1\)/ })).toBeVisible()
})

test('a fee bucket filters, and the empty state offers to clear just that filter', async ({
  page,
}) => {
  await page.goto('/institutes')

  // The seeded fees are ₹25,000 and ₹90,000, so this bucket empties the set.
  await page.getByRole('link', { name: 'Over ₹1,00,000' }).click()

  await expect(page.getByText('No institutes match these filters yet.')).toBeVisible()

  await page.getByRole('link', { name: 'Clear the fee filter' }).click()

  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
})

test('the lowest-fee bucket keeps only the cheaper institute', async ({ page }) => {
  await page.goto('/institutes')
  await page.getByRole('link', { name: 'Under ₹25,000' }).click()

  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Medico Classes/ })).toHaveCount(0)
})

test('a fee range shows on the card', async ({ page }) => {
  await page.goto('/institutes?q=allen')
  await expect(page.getByText('₹25,000', { exact: true })).toBeVisible()
})

test('query result pages are not indexable', async ({ page }) => {
  await page.goto('/institutes?q=allen')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')

  // The browse page itself must stay indexable.
  await page.goto('/institutes')
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})
