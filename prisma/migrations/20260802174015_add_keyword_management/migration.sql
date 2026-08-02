-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keywords_campaignId_idx" ON "keywords"("campaignId");

-- CreateIndex
CREATE INDEX "keywords_campaignId_isActive_idx" ON "keywords"("campaignId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_campaignId_value_key" ON "keywords"("campaignId", "value");

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: backfill one active Keyword row per existing
-- Campaign.triggerKeywords entry, so campaigns created before Keyword
-- Management existed keep matching exactly as before. triggerKeywords
-- itself is untouched by this migration — it becomes a derived cache,
-- kept in sync by the Keyword service from this point forward.
INSERT INTO "keywords" ("id", "campaignId", "value", "isActive", "createdAt", "updatedAt")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || c."id" || kw.value), 1, 25),
  c."id",
  kw.value,
  true,
  now(),
  now()
FROM "campaigns" c
CROSS JOIN LATERAL unnest(c."triggerKeywords") AS kw(value)
ON CONFLICT ("campaignId", "value") DO NOTHING;
