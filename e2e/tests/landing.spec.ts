import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

/// Pune gets three JEE institutes so it clears the indexing threshold;
/// Mumbai gets one so it does not. One Pune institute is also NEET, which
/// makes /neet-coaching-in-pune a thin page.
test.beforeAll(async () => {
  await truncateAll()

  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const mumbai = await prisma.city.create({
    data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
  const neet = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  const make = (
    slug: string,
    cityId: string,
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[],
    tagIds: string[],
    fee: number,
  ) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name: slug.replace(/-/g, ' ').toUpperCase(),
        status: 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId,
        instituteProfile: { create: { modes } },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        batches: {
          create: {
            title: `${slug} batch`,
            exam: 'JEE',
            mode: modes[0] ?? 'OFFLINE',
            startDate: new Date('2028-04-01T00:00:00Z'),
            seatsTotal: 20,
            seatsAvailable: 20,
            feeAmount: fee,
            status: 'PUBLISHED',
          },
        },
      },
    })

  await make('alpha-academy', pune.id, ['OFFLINE'], [jee.id], 2_500_000)
  await make('beta-academy', pune.id, ['OFFLINE'], [jee.id], 7_000_000)
  await make('gamma-academy', pune.id, ['ONLINE'], [jee.id, neet.id], 15_000_000)
  await make('delta-academy', mumbai.id, ['ONLINE'], [jee.id], 5_000_000)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('an indexable landing page renders its listings and is indexable', async ({ page }) => {
  await page.goto('/jee-coaching-in-pune')

  await expect(page.getByRole('heading', { level: 1, name: 'JEE Coaching in Pune' })).toBeVisible()
  await expect(page.getByText('3 institutes', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: /ALPHA ACADEMY/ })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('a thin landing page renders but is not indexed', async ({ page }) => {
  // Mumbai has one JEE institute, below the threshold of three.
  await page.goto('/jee-coaching-in-mumbai')

  await expect(
    page.getByRole('heading', { level: 1, name: 'JEE Coaching in Mumbai' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /DELTA ACADEMY/ })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('a mode variant that duplicates its parent canonicalises to it', async ({ page }) => {
  // Mumbai's only JEE institute is online, so this page is a duplicate.
  await page.goto('/online-jee-coaching-in-mumbai')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/jee-coaching-in-mumbai$/,
  )
})

test('a mode variant that genuinely narrows canonicalises to itself', async ({ page }) => {
  // Two of three Pune JEE institutes are offline.
  await page.goto('/offline-jee-coaching-in-pune')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/offline-jee-coaching-in-pune$/,
  )
})

test('sibling links point laterally and never at the page itself', async ({ page }) => {
  await page.goto('/jee-coaching-in-pune')

  await expect(page.getByRole('link', { name: /NEET \(1\)/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mumbai \(1\)/ })).toBeVisible()
  // No sibling chip for the page's own exam.
  await expect(page.getByRole('link', { name: /^JEE \(/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Mumbai \(1\)/ }).click()
  await expect(page).toHaveURL(/\/jee-coaching-in-mumbai$/)
})

test('an unknown combination and a non-landing path both 404', async ({ page }) => {
  expect((await page.goto('/gate-coaching-in-pune'))?.status()).toBe(404)
  expect((await page.goto('/neet-coaching-in-mumbai'))?.status()).toBe(404)
  expect((await page.goto('/random-nonsense'))?.status()).toBe(404)
})

test('an institute page links into the landing graph', async ({ page }) => {
  await page.goto('/institutes/alpha-academy')

  const link = page.getByRole('link', { name: /JEE coaching in Pune/ })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/jee-coaching-in-pune$/)
})

test('the sitemap contains indexable landing pages and excludes thin ones', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()

  expect(xml).toContain('/jee-coaching-in-pune')
  // One listing each — below the threshold, so absent.
  expect(xml).not.toContain('/jee-coaching-in-mumbai')
  expect(xml).not.toContain('/neet-coaching-in-pune')
})
