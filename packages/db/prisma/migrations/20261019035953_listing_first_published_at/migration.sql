-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "firstPublishedAt" TIMESTAMP(3);

-- A listing that is or was public already has a frozen slug (BR-002).
UPDATE "Listing" SET "firstPublishedAt" = COALESCE("publishedAt", "updatedAt")
WHERE "status" IN ('PUBLISHED', 'SUSPENDED');
