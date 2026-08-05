import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import type { DeliveryStatus, PipelineStage } from "@prisma/client";

// Shared fixture helpers for DB-backed tests (services/trigger-matcher,
// lib/modules/keywords/keyword-service, Phase A's reliability suites).
// Every fixture uses a randomUUID suffix so concurrent test files never
// collide on unique constraints (SocialAccount.instagramBusinessId,
// ConversionLog.commentId, etc).

export async function createTestSocialAccount(overrides: Partial<{
  status: "ACTIVE" | "DISCONNECTED" | "TOKEN_EXPIRED";
  isConnected: boolean;
  // Raw (unencrypted) token — the fixture encrypts it before storage, same
  // as the real OAuth callback does. Defaults to a random value so
  // decrypt() in the reply services succeeds against a real ciphertext,
  // not a plain string.
  pageAccessToken: string;
  tokenExpiresAt: Date | null;
  // MR-3.2 (Single Organization Ownership): undefined (the default) means
  // no organization — same as every fixture-created account before this
  // milestone. Pass an id to simulate a customer-connected account.
  organizationId: string;
}> = {}) {
  const suffix = randomUUID();
  return prisma.socialAccount.create({
    data: {
      instagramBusinessId: `test-ig-biz-${suffix}`,
      pageAccessToken: encrypt(overrides.pageAccessToken ?? `test-plaintext-token-${suffix}`),
      instagramUsername: `test_account_${suffix.slice(0, 8)}`,
      status: overrides.status ?? "ACTIVE",
      isConnected: overrides.isConnected ?? true,
      tokenExpiresAt: overrides.tokenExpiresAt,
      organizationId: overrides.organizationId,
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
  status: DeliveryStatus;
  campaignId: string;
  leadId: string;
  retryCount: number;
  nextRetryAt: Date | null;
  claimExpiresAt: Date | null;
  pendingStage: PipelineStage | null;
  dmSentAt: Date | null;
  publicRepliedAt: Date | null;
}> = {}) {
  const suffix = randomUUID();
  return prisma.conversionLog.create({
    data: {
      commentId: overrides.commentId ?? `test-comment-${suffix}`,
      commentText: overrides.commentText ?? "test comment",
      instagramUserId: overrides.instagramUserId ?? `test-ig-user-${suffix}`,
      status: overrides.status ?? "PENDING",
      campaignId: overrides.campaignId,
      leadId: overrides.leadId,
      retryCount: overrides.retryCount,
      nextRetryAt: overrides.nextRetryAt,
      claimExpiresAt: overrides.claimExpiresAt,
      pendingStage: overrides.pendingStage,
      dmSentAt: overrides.dmSentAt,
      publicRepliedAt: overrides.publicRepliedAt,
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
