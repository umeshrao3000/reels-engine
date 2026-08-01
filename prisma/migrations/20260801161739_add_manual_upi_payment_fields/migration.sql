-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_VERIFICATION';
ALTER TYPE "PaymentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "utr" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
