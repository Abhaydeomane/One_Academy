-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "changedSinceReviewAt" TIMESTAMP(3),
ADD COLUMN     "reviewedSnapshot" JSONB;
