-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedByClerkUserId" TEXT,
ADD COLUMN     "suspensionReason" TEXT;
