-- P2c (ADR 0019). No MediaAsset rows exist in any environment, so `url` is
-- replaced rather than migrated: public URLs are built from storageKey.

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('LOGO', 'PHOTO');

-- AlterTable
ALTER TABLE "MediaAsset" DROP COLUMN "url",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "height" INTEGER NOT NULL,
ADD COLUMN     "purpose" "MediaPurpose" NOT NULL DEFAULT 'PHOTO',
ADD COLUMN     "storageKey" TEXT NOT NULL,
ADD COLUMN     "width" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");


-- BR-020: at most one logo per listing. Prisma cannot express a partial index.
CREATE UNIQUE INDEX "MediaAsset_one_logo_per_listing" ON "MediaAsset" ("listingId") WHERE "purpose" = 'LOGO';
