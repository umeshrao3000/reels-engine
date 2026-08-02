import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_KEYWORDS_PER_CAMPAIGN, normalizeKeywordList, normalizeKeywordValue } from "./normalize";

// Single-responsibility Keyword CRUD service. Keyword rows are the source
// of truth for individual keywords (add/edit/delete/enable/disable);
// Campaign.triggerKeywords is a derived cache that services/trigger-matcher.ts
// (Milestone 3) already reads unchanged — every mutation here keeps that
// cache in sync in the same transaction, so the matching engine needs no
// code changes to pick up keyword edits.

export class DuplicateKeywordError extends Error {}

async function syncCampaignKeywordCache(
  tx: Prisma.TransactionClient,
  campaignId: string
): Promise<void> {
  const active = await tx.keyword.findMany({
    where: { campaignId, isActive: true },
    orderBy: { value: "asc" },
    select: { value: true },
  });
  await tx.campaign.update({
    where: { id: campaignId },
    data: { triggerKeywords: active.map((k) => k.value) },
  });
}

export type BulkAddResult = {
  created: string[];
  skipped: string[];
  rejectedTooLong: string[];
  rejectedLimitReached: string[];
};

/**
 * Bulk add: comma/newline-separated raw text, normalized and deduped.
 * Existing values are reported as skipped, not errored. Bounded by
 * MAX_KEYWORDS_PER_CAMPAIGN so one paste can't grow a campaign's active
 * keyword list without limit.
 */
export async function bulkAddKeywords(campaignId: string, raw: string): Promise<BulkAddResult> {
  const { values, rejectedTooLong } = normalizeKeywordList(raw);
  if (values.length === 0) return { created: [], skipped: [], rejectedTooLong, rejectedLimitReached: [] };

  return prisma.$transaction(async (tx) => {
    const [existing, currentCount] = await Promise.all([
      tx.keyword.findMany({ where: { campaignId, value: { in: values } }, select: { value: true } }),
      tx.keyword.count({ where: { campaignId } }),
    ]);
    const existingSet = new Set(existing.map((k) => k.value));
    const newValues = values.filter((value) => !existingSet.has(value));

    const remainingCapacity = Math.max(0, MAX_KEYWORDS_PER_CAMPAIGN - currentCount);
    const toCreate = newValues.slice(0, remainingCapacity);
    const rejectedLimitReached = newValues.slice(remainingCapacity);

    if (toCreate.length > 0) {
      await tx.keyword.createMany({ data: toCreate.map((value) => ({ campaignId, value })) });
      await syncCampaignKeywordCache(tx, campaignId);
    }

    return {
      created: toCreate,
      skipped: values.filter((value) => existingSet.has(value)),
      rejectedTooLong,
      rejectedLimitReached,
    };
  });
}

export type UpdateKeywordInput = { value?: string; isActive?: boolean };

/** Edit a keyword's value and/or active state. Returns null if it doesn't belong to this campaign. */
export async function updateKeyword(
  campaignId: string,
  keywordId: string,
  input: UpdateKeywordInput
) {
  const data: Prisma.KeywordUpdateInput = {};
  if (input.value !== undefined) {
    const normalized = normalizeKeywordValue(input.value);
    if (!normalized) throw new Error("Keyword value cannot be empty.");
    data.value = normalized;
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.keyword.findFirst({ where: { id: keywordId, campaignId } });
    if (!existing) return null;

    try {
      const updated = await tx.keyword.update({ where: { id: keywordId }, data });
      await syncCampaignKeywordCache(tx, campaignId);
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new DuplicateKeywordError("That keyword already exists for this campaign.");
      }
      throw err;
    }
  });
}

/** Delete a keyword. Returns false if it doesn't belong to this campaign. */
export async function deleteKeyword(campaignId: string, keywordId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.keyword.findFirst({ where: { id: keywordId, campaignId } });
    if (!existing) return false;
    await tx.keyword.delete({ where: { id: keywordId } });
    await syncCampaignKeywordCache(tx, campaignId);
    return true;
  });
}
