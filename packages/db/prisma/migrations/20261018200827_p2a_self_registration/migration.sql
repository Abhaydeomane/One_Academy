-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByClerkUserId" TEXT;

-- Listings already waiting for review get a submission time so the admin
-- queue order is defined from the first deploy.
UPDATE "Listing" SET "submittedAt" = "updatedAt" WHERE "status" = 'PENDING_REVIEW';

-- Organisations with a published listing were verified by hand before P2a.
-- Without this, their next listing would be flagged as a new institute.
UPDATE "Organization" o SET "verifiedAt" = now()
WHERE EXISTS (
  SELECT 1 FROM "Listing" l WHERE l."organizationId" = o."id" AND l."status" = 'PUBLISHED'
);
