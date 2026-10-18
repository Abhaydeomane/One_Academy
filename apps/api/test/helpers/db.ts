import { prisma } from '@one/db'

// Truncate rather than delete so every test starts from a known empty state
// regardless of what ran before it.
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Enquiry", "Review", "ListingTag", "MediaAsset", "ListingRedirect",
      "Batch", "InstituteProfile", "Listing", "Membership", "Organization", "User",
      "Tag", "City" RESTART IDENTITY CASCADE;
  `)
}

export type MinimalSeed = {
  orgId: string
  otherOrgId: string
  cityId: string
  adminUserId: string
  publishedListingId: string
  draftListingId: string
  publishedSlug: string
  draftSlug: string
  publishedBatchId: string
}

/// One published listing with one published and one draft batch, plus a draft
/// listing. The draft rows exist so BR-009 can be asserted, not as filler.
export async function seedMinimal(): Promise<MinimalSeed> {
  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const otherOrg = await prisma.organization.create({ data: { name: 'Beta', slug: 'beta' } })
  const admin = await prisma.user.create({
    data: { email: 'admin@test.local', globalRole: 'ADMIN' },
  })
  const exam = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })

  const published = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'alpha-academy',
      name: 'Alpha Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      organizationId: org.id,
      cityId: city.id,
      locality: 'Kothrud',
      shortDescription: 'JEE coaching',
      instituteProfile: {
        create: { establishedYear: 2011, facultyCount: 24, modes: ['OFFLINE'] },
      },
      tags: { create: [{ tagId: exam.id }] },
      batches: {
        create: [
          {
            title: 'JEE 2027',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-04-01T00:00:00Z'),
            seatsTotal: 60,
            seatsAvailable: 18,
            feeAmount: 12500000,
            status: 'PUBLISHED',
          },
          {
            title: 'Hidden draft batch',
            exam: 'NEET',
            mode: 'ONLINE',
            startDate: new Date('2027-05-01T00:00:00Z'),
            seatsTotal: 20,
            seatsAvailable: 20,
            feeAmount: 9900000,
            status: 'DRAFT',
          },
        ],
      },
    },
    include: { batches: true },
  })

  const draft = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'draft-academy',
      name: 'Draft Academy',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: city.id,
      address: '1 Test Road, Pune 411001',
      contactPhone: '9000000001',
      tags: { create: [{ tagId: exam.id }] },
      instituteProfile: { create: { modes: ['ONLINE'] } },
    },
  })

  const publishedBatch = published.batches.find((batch) => batch.status === 'PUBLISHED')
  if (!publishedBatch) throw new Error('seed invariant: expected a published batch')

  return {
    orgId: org.id,
    otherOrgId: otherOrg.id,
    cityId: city.id,
    adminUserId: admin.id,
    publishedListingId: published.id,
    draftListingId: draft.id,
    publishedSlug: published.slug,
    draftSlug: draft.slug,
    publishedBatchId: publishedBatch.id,
  }
}
