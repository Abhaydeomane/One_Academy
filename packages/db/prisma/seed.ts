import { prisma } from '../src/client.js'

// Fixed IDs so tests, manual checks and E2E specs can reference known rows.
// Idempotent: running this twice must be a no-op, not a duplicate-key error.

const CITIES = [
  { id: 'city-pune', slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  { id: 'city-mumbai', slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  { id: 'city-delhi', slug: 'delhi', name: 'Delhi', state: 'Delhi' },
]

const TAGS = [
  { id: 'tag-jee', slug: 'jee', label: 'JEE', kind: 'EXAM' as const },
  { id: 'tag-neet', slug: 'neet', label: 'NEET', kind: 'EXAM' as const },
  { id: 'tag-hostel', slug: 'hostel', label: 'Hostel', kind: 'AMENITY' as const },
]

async function main() {
  for (const city of CITIES) {
    await prisma.city.upsert({ where: { id: city.id }, create: city, update: city })
  }

  for (const tag of TAGS) {
    await prisma.tag.upsert({ where: { id: tag.id }, create: tag, update: tag })
  }

  await prisma.organization.upsert({
    where: { id: 'org-seed-alpha' },
    create: {
      id: 'org-seed-alpha',
      name: 'Alpha Education Group',
      slug: 'alpha-education-group',
      verifiedAt: new Date('2026-01-01T00:00:00Z'),
    },
    update: { verifiedAt: new Date('2026-01-01T00:00:00Z') },
  })

  // Local-only fixture row. Admin rights come from the Clerk session's
  // metadata.globalRole (ADR 0006); User.globalRole is not used for authorization.
  await prisma.user.upsert({
    where: { id: 'user-seed-admin' },
    create: {
      id: 'user-seed-admin',
      email: 'admin@oneacademy.local',
      name: 'Seed Admin',
      globalRole: 'ADMIN',
    },
    update: { globalRole: 'ADMIN' },
  })

  // Fees are minor units (BR-005): 12500000 paise is ₹125,000.
  await prisma.listing.upsert({
    where: { id: 'listing-alpha' },
    update: {},
    create: {
      id: 'listing-alpha',
      vertical: 'INSTITUTE',
      slug: 'alpha-academy',
      name: 'Alpha Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      firstPublishedAt: new Date('2026-01-01T00:00:00Z'),
      organizationId: 'org-seed-alpha',
      cityId: 'city-pune',
      locality: 'Kothrud',
      shortDescription: 'JEE and NEET coaching with small batch sizes.',
      instituteProfile: {
        create: {
          establishedYear: 2011,
          facultyCount: 24,
          modes: ['OFFLINE', 'HYBRID'],
          website: 'https://alpha.example.com',
          about: 'Alpha Academy has prepared students for JEE and NEET since 2011.',
        },
      },
      tags: { create: [{ tagId: 'tag-jee' }, { tagId: 'tag-neet' }] },
      batches: {
        create: [
          {
            id: 'batch-alpha-published',
            title: 'JEE Advanced 2027 — Morning',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-04-01T00:00:00Z'),
            endDate: new Date('2027-12-20T00:00:00Z'),
            scheduleText: 'Mon-Sat, 7:00-10:00',
            seatsTotal: 60,
            seatsAvailable: 18,
            feeAmount: 12500000,
            feeCurrency: 'INR',
            status: 'PUBLISHED',
          },
          {
            id: 'batch-alpha-draft',
            title: 'NEET 2027 — Evening',
            exam: 'NEET',
            mode: 'HYBRID',
            startDate: new Date('2027-05-15T00:00:00Z'),
            seatsTotal: 40,
            seatsAvailable: 40,
            feeAmount: 9900000,
            feeCurrency: 'INR',
            status: 'DRAFT',
          },
        ],
      },
    },
  })

  // Exists so BR-009 can be checked by hand: this must never appear publicly.
  await prisma.listing.upsert({
    where: { id: 'listing-draft' },
    update: {},
    create: {
      id: 'listing-draft',
      vertical: 'INSTITUTE',
      slug: 'draft-academy',
      name: 'Draft Academy',
      status: 'DRAFT',
      organizationId: 'org-seed-alpha',
      cityId: 'city-mumbai',
      shortDescription: 'Not yet published — must never appear in public routes.',
      instituteProfile: { create: { establishedYear: 2024, modes: ['ONLINE'] } },
    },
  })

  for (let i = 1; i <= 8; i++) {
    const id = `listing-filler-${i}`
    const city = CITIES[i % CITIES.length]
    if (!city) throw new Error('seed invariant: CITIES must not be empty')

    await prisma.listing.upsert({
      where: { id },
      update: {},
      create: {
        id,
        vertical: 'INSTITUTE',
        slug: `filler-institute-${i}`,
        name: `Filler Institute ${i}`,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-02-01T00:00:00Z'),
        firstPublishedAt: new Date('2026-02-01T00:00:00Z'),
        organizationId: 'org-seed-alpha',
        cityId: city.id,
        shortDescription: `Pagination fixture number ${i}.`,
        instituteProfile: { create: { modes: ['ONLINE'] } },
        // Every filler is tagged JEE, and the even ones are also NEET. That
        // distribution is deliberate: it puts three JEE institutes in each
        // seeded city, so every /jee-coaching-in-<city> landing page clears
        // LANDING_MIN_INDEXABLE, while the NEET pages stay thin and exercise
        // the noindex branch.
        tags: {
          create:
            i % 2 === 0 ? [{ tagId: 'tag-jee' }, { tagId: 'tag-neet' }] : [{ tagId: 'tag-jee' }],
        },
        batches: {
          create: [
            {
              title: `Batch ${i}`,
              exam: i % 2 === 0 ? 'JEE' : 'NEET',
              mode: 'ONLINE',
              startDate: new Date('2027-06-01T00:00:00Z'),
              seatsTotal: 30,
              seatsAvailable: 30,
              feeAmount: 5000000,
              status: 'PUBLISHED',
            },
          ],
        },
      },
    })
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect()
    throw error
  })
