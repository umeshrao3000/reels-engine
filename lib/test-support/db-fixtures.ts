import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Shared fixture helpers for DB-backed tests (services/trigger-matcher,
// lib/modules/keywords/keyword-service). Every fixture uses a randomUUID
// suffix so concurrent test files never collide on unique constraints
// (SocialAccount.instagramBusinessId, ConversionLog.commentId, etc).

export async function createTestSocialAccount(overrides: Partial<{
  status: "ACTIVE" | "DISCONNECTED" | "TOKEN_EXPIRED";
}> = {}) {
  const suffix = randomUUID();
  return prisma.socialAccount.create({
    data: {
      instagramBusinessId: `test-ig-biz-${suffix}`,
      pageAccessToken: `test-token-${suffix}`,
      instagramUsername: `test_account_${suffix.slice(0, 8)}`,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

export async function createTestCampaign(
  socialAccountId: string,
  overrides: Partial<{
    instagramMediaId: string;
    triggerKeywords: string[];
    isActive: boolean;
  }> = {}
) {
  const suffix = randomUUID();
  return prisma.campaign.create({
    data: {
      socialAccountId,
      instagramMediaId: overrides.instagramMediaId ?? `test-media-${suffix}`,
      name: `Test Campaign ${suffix.slice(0, 8)}`,
      triggerKeywords: overrides.triggerKeywords ?? ["deal"],
      dmTemplate: "Thanks for your interest!",
      publicReplyTemplate: "Check your DMs!",
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createTestConversionLog(overrides: Partial<{
  commentId: string;
  commentText: string;
  instagramUserId: string;
  mediaId: string;
  status: "PENDING" | "MATCHED" | "DM_SENT" | "PUBLIC_REPLIED" | "SUCCESS" | "FAILED" | "SKIPPED";
}> = {}) {
  const suffix = randomUUID();
  return prisma.conversionLog.create({
    data: {
      commentId: overrides.commentId ?? `test-comment-${suffix}`,
      commentText: overrides.commentText ?? "test comment",
      instagramUserId: overrides.instagramUserId ?? `test-ig-user-${suffix}`,
      status: overrides.status ?? "PENDING",
      rawPayload: overrides.mediaId
        ? { media: { id: overrides.mediaId }, from: { id: overrides.instagramUserId ?? `test-ig-user-${suffix}`, username: "test_user" } }
        : undefined,
    },
  });
}

/** Deletes every row this fixture module could plausibly have created, scoped to the given social account. Cascades to campaigns/keywords/conversion logs. */
export async function cleanupTestSocialAccount(socialAccountId: string): Promise<void> {
  await prisma.socialAccount.delete({ where: { id: socialAccountId } }).catch(() => {});
}

export async function cleanupTestConversionLog(id: string): Promise<void> {
  await prisma.conversionLog.delete({ where: { id } }).catch(() => {});
}

export async function cleanupTestLead(instagramUserId: string): Promise<void> {
  await prisma.lead.delete({ where: { instagramUserId } }).catch(() => {});
}
