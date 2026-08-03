/*
  Warnings:

  - Added the required column `updatedAt` to the `conversion_logs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('PRIVATE_REPLY', 'PUBLIC_REPLY');

-- CreateEnum
CREATE TYPE "MetaErrorClassification" AS ENUM ('TRANSIENT', 'PERMANENT', 'AUTH', 'AMBIGUOUS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'DM_SENDING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'PUBLIC_REPLYING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'RETRY_PENDING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'ACCOUNT_BLOCKED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'DELIVERY_UNCERTAIN';
ALTER TYPE "DeliveryStatus" ADD VALUE 'DEAD_LETTER';

-- AlterTable
ALTER TABLE "conversion_logs" ADD COLUMN     "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastFailureClassification" "MetaErrorClassification",
ADD COLUMN     "lastMetaErrorCode" INTEGER,
ADD COLUMN     "lastMetaErrorStatus" INTEGER,
ADD COLUMN     "lastMetaErrorSubcode" INTEGER,
ADD COLUMN     "pendingStage" "PipelineStage",
ADD COLUMN     "privateReplyMessageId" TEXT,
ADD COLUMN     "publicReplyId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill existing rows before enforcing NOT NULL: createdAt is the best
-- available approximation of "last updated" for rows that predate this
-- column.
UPDATE "conversion_logs" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

ALTER TABLE "conversion_logs" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "cron_locks" (
    "id" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "cron_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversion_logs_status_nextRetryAt_idx" ON "conversion_logs"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "conversion_logs_status_claimExpiresAt_idx" ON "conversion_logs"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "social_accounts_status_tokenExpiresAt_idx" ON "social_accounts"("status", "tokenExpiresAt");
