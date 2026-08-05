import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { assertCampaignOwnership } from "@/lib/modules/organizations/ownership";
import { CampaignForm } from "@/app/ops/(protected)/campaigns/_components/CampaignForm";
import { DeleteCampaignButton } from "@/app/ops/(protected)/campaigns/[id]/_components/DeleteCampaignButton";
import { KeywordManagement } from "@/app/ops/(protected)/campaigns/[id]/_components/KeywordManagement";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/campaigns/[id]/page.tsx. Ownership-checked
// (assertCampaignOwnership), not a plain findUnique — a campaign owned by
// a different organization renders the same 404 as one that doesn't
// exist, per the isolation boundary used everywhere else in this
// milestone.
export default async function CustomerEditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getCustomerContext();
  if (!context) redirect("/login");

  const { id } = await params;

  const owned = await assertCampaignOwnership(context.organization.id, id);
  if (!owned) notFound();

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id },
    include: {
      socialAccount: { select: { instagramUsername: true, instagramBusinessId: true } },
      keywords: { orderBy: { value: "asc" } },
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Edit Campaign</h1>

      <CampaignForm
        mode="edit"
        campaignId={campaign.id}
        socialAccounts={[
          {
            id: campaign.socialAccountId,
            label: campaign.socialAccount.instagramUsername ?? campaign.socialAccount.instagramBusinessId,
          },
        ]}
        initialValues={{
          name: campaign.name,
          socialAccountId: campaign.socialAccountId,
          instagramMediaId: campaign.instagramMediaId,
          dmTemplate: campaign.dmTemplate,
          publicReplyTemplate: campaign.publicReplyTemplate,
          isActive: campaign.isActive,
        }}
        apiBasePath="/api/customer/campaigns"
        successHref="/dashboard/campaigns"
      />

      <KeywordManagement
        campaignId={campaign.id}
        keywords={campaign.keywords.map((k) => ({ id: k.id, value: k.value, isActive: k.isActive }))}
        apiBasePath="/api/customer/campaigns"
      />

      <DeleteCampaignButton
        campaignId={campaign.id}
        apiBasePath="/api/customer/campaigns"
        backHref="/dashboard/campaigns"
      />

      <Link
        href="/dashboard/campaigns"
        className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Back to Campaigns
      </Link>
    </div>
  );
}
