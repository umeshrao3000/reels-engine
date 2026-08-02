-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'TOKEN_EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DM_SENT', 'PUBLIC_REPLIED', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "instagramBusinessId" TEXT NOT NULL,
    "pageAccessToken" TEXT NOT NULL,
    "instagramUsername" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "instagramMediaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerKeywords" TEXT[],
    "dmTemplate" TEXT NOT NULL,
    "publicReplyTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "handle" TEXT,
    "lastInteractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_logs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "leadId" TEXT,
    "commentId" TEXT NOT NULL,
    "commentText" TEXT,
    "instagramUserId" TEXT,
    "matchedKeyword" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "dmSentAt" TIMESTAMP(3),
    "publicRepliedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_instagramBusinessId_key" ON "social_accounts"("instagramBusinessId");

-- CreateIndex
CREATE INDEX "campaigns_instagramMediaId_isActive_idx" ON "campaigns"("instagramMediaId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "leads_instagramUserId_key" ON "leads"("instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_logs_commentId_key" ON "conversion_logs"("commentId");

-- CreateIndex
CREATE INDEX "conversion_logs_campaignId_idx" ON "conversion_logs"("campaignId");

-- CreateIndex
CREATE INDEX "conversion_logs_status_idx" ON "conversion_logs"("status");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_logs" ADD CONSTRAINT "conversion_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_logs" ADD CONSTRAINT "conversion_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
