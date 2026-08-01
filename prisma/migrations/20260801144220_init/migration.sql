-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PAID', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('ORIGINAL', 'PROCESSED');

-- CreateEnum
CREATE TYPE "UploadSourceType" AS ENUM ('DIRECT', 'GOOGLE_DRIVE', 'DROPBOX', 'ONEDRIVE', 'WETRANSFER', 'URL');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "assignedEditor" TEXT,
    "internalNotes" TEXT,
    "editorNotes" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "keywordsPackage" BOOLEAN NOT NULL DEFAULT false,
    "automationPackage" BOOLEAN NOT NULL DEFAULT false,
    "monitoringPackage" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "sourceType" "UploadSourceType" NOT NULL,
    "location" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_shareToken_key" ON "projects"("shareToken");

-- CreateIndex
CREATE INDEX "payments_projectId_idx" ON "payments"("projectId");

-- CreateIndex
CREATE INDEX "uploads_projectId_idx" ON "uploads"("projectId");

-- CreateIndex
CREATE INDEX "revisions_projectId_idx" ON "revisions"("projectId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
