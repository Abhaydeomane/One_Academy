import { prisma } from '@one/db'

export async function truncateAll() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Enquiry", "Review", "ListingTag", "MediaAsset", "ListingRedirect",
      "Batch", "InstituteProfile", "Listing", "Membership", "Organization", "User",
      "Tag", "City" RESTART IDENTITY CASCADE;
  `)
}

export { prisma }
