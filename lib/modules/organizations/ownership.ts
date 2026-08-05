import { prisma } from "@/lib/prisma";

// MR-3.2 (Single Organization Ownership): the cross-organization isolation
// boundary. Every customer-facing route that reads/writes a SocialAccount
// or Campaign must go through one of these — "not found" and "found but
// owned by a different organization" are deliberately collapsed into the
// same null/404 outcome, so a customer probing another organization's ids
// learns nothing (no distinct "exists but isn't yours" signal).

/** Returns the SocialAccount only if it belongs to this organization, else null. */
export async function assertSocialAccountOwnership(organizationId: string, socialAccountId: string) {
  return prisma.socialAccount.findFirst({
    where: { id: socialAccountId, organizationId },
  });
}

/**
 * Returns the Campaign only if it belongs to this organization (via its
 * SocialAccount), else null. Campaign itself carries no organizationId —
 * ownership is derived through the existing socialAccountId relation, per
 * the "no redundant column where ownership is already implied" rule.
 */
export async function assertCampaignOwnership(organizationId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, socialAccount: { organizationId } },
  });
}
