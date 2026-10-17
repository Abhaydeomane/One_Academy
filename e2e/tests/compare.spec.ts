import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

// Fees are paise (BR-005). Alpha is cheapest and starts soonest; Beta has two
// batches so its column has a real choice to make; Gamma is dearest. Alpha
// also has a batch that already started, which must never be offered.
const SOON = new Date('2030-02-01T00:00:00Z')
const LATER = new Date('2030-08-01T00:00:00Z')
const PAST = new Date('2020-02-01T00:00:00Z')

test.beforeAll(async () => {
  await truncateAll()

  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Org', slug: 'org' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })

  const make = (slug: string, name: string) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId: pune.id,
        locality: 'Kothrud',
        instituteProfile: {
          create: { establishedYear: 2011, facultyCount: 24, modes: ['OFFLINE'] },
        },
        tags: { create: [{ tagId: jee.id }] },
      },
    })

  const alpha = await make('alpha-academy', 'Alpha Academy')
  const beta = await make('beta-academy', 'Beta Academy')
  const gamma = await make('gamma-academy', 'Gamma Academy')

  const batch = (listingId: string, title: string, feeAmount: number, startDate: Date) =>
    prisma.batch.create({
      data: {
        listingId,
        title,
        exam: 'JEE',
        mode: 'OFFLINE',
        startDate,
        seatsTotal: 30,
        seatsAvailable: 10,
        feeAmount,
        status: 'PUBLISHED',
      },
    })

  await batch(alpha.id, 'Alpha morning', 3_000_000, SOON)
  await batch(alpha.id, 'Alpha already started', 100_000, PAST)
  await batch(beta.id, 'Beta cheap', 5_000_000, LATER)
  await batch(beta.id, 'Beta premium', 9_000_000, LATER)
  await batch(gamma.id, 'Gamma only', 11_000_000, LATER)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('selecting two institutes on results leads to a comparison', async ({ page }) => {
  await page.goto('/institutes')

  await page.getByRole('checkbox', { name: 'Add Alpha Academy to comparison' }).check()
  await page.getByRole('checkbox', { name: 'Add Beta Academy to comparison' }).check()

  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Compare' }).click()

  await expect(page).toHaveURL(/\/compare\?slug=/)
  await expect(page.getByRole('rowheader', { name: 'Fee' })).toBeVisible()
})

test('the compare button is disabled below two selections', async ({ page }) => {
  await page.goto('/institutes')
  await page.getByRole('checkbox', { name: 'Add Alpha Academy to comparison' }).check()

  await expect(page.getByText(/1 selected/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare' })).toBeDisabled()
})

test('selection works from a landing page too', async ({ page }) => {
  await page.goto('/jee-coaching-in-pune')

  await page.getByRole('checkbox', { name: 'Add Alpha Academy to comparison' }).check()
  await page.getByRole('checkbox', { name: 'Add Gamma Academy to comparison' }).check()
  await page.getByRole('button', { name: 'Compare' }).click()

  await expect(page).toHaveURL(/\/compare\?slug=/)
  await expect(page.getByRole('columnheader', { name: /Gamma Academy/ })).toBeVisible()
})

test('the attribute column is sticky inside a container that really overflows', async ({
  page,
}) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy&slug=gamma-academy')

  const feeHeader = page.getByRole('rowheader', { name: 'Fee' })
  await expect(feeHeader).toHaveCSS('position', 'sticky')
  await expect(feeHeader).toHaveCSS('left', '0px')

  // The overflow is what makes the sticky column meaningful rather than
  // decorative, so assert it actually happens at this viewport. Evaluated
  // through the locator rather than page.evaluate, so the callback's element is
  // typed and the spec needs no DOM lib.
  const overflows = await page.locator('table').evaluate((table) => {
    const scroller = table.parentElement
    return scroller ? scroller.scrollWidth > scroller.clientWidth : false
  })
  expect(overflows).toBe(true)
})

test('only the cheapest batch is pinned, and the past batch is never offered', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')

  // Alpha's only upcoming batch, so no selector is rendered for it.
  await expect(page.getByText('₹30,000')).toBeVisible()
  await expect(page.getByLabel('Batch for Alpha Academy')).toHaveCount(0)

  // Beta has two, so it does — and the cheaper one is selected.
  await expect(page.getByLabel('Batch for Beta Academy')).toHaveValue(/beta-academy:/)
  await expect(page.getByText('₹50,000')).toBeVisible()
  await expect(page.getByText('₹1,000')).toHaveCount(0)
})

test('the lowest fee and soonest start are tagged exactly once each', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy&slug=gamma-academy')

  await expect(page.getByText('lowest', { exact: true })).toHaveCount(1)
  await expect(page.getByText('soonest', { exact: true })).toHaveCount(1)
})

test('changing a batch pins it in the URL', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')

  await page.getByLabel('Batch for Beta Academy').selectOption({ label: 'Beta premium' })

  await expect(page).toHaveURL(/batch=beta-academy%3A/)
  await expect(page.getByText('₹90,000')).toBeVisible()
  // The other column's selection survives, because the picker carries it.
  await expect(page.getByText('₹30,000')).toBeVisible()
})

test('the enquiry CTA carries the pinned batch', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')

  await page.getByRole('link', { name: 'Enquire' }).first().click()

  await expect(page).toHaveURL(/\/institutes\/alpha-academy\?batchId=/)
})

test('a dropped institute is reported rather than hidden', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy&slug=ghost-academy')

  await expect(page.getByText(/ghost-academy is no longer listed/)).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveCount(2)
})

test('an invalid or unsatisfiable comparison URL is a 404, never a 500', async ({ page }) => {
  // Fewer than two survive.
  expect(
    (await page.goto('/compare?slug=alpha-academy&slug=ghost-one&slug=ghost-two'))?.status(),
  ).toBe(404)
  // Below the BR-008 minimum.
  expect((await page.goto('/compare?slug=alpha-academy'))?.status()).toBe(404)
  // A malformed pin.
  expect(
    (await page.goto('/compare?slug=alpha-academy&slug=beta-academy&batch=garbage'))?.status(),
  ).toBe(404)
})

test('a comparison page is never indexable', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('the sitemap never lists a comparison', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()

  expect(xml).not.toContain('/compare')
})
