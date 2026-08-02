import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CampaignForm } from "@/app/ops/(protected)/campaigns/_components/CampaignForm";
import { DeleteCampaignButton } from "./_components/DeleteCampaignButton";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { socialAccount: { select: { instagramUsername: true, instagramBusinessId: true } } },
  });
  if (!campaign) notFound();

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
          triggerKeywords: campaign.triggerKeywords.join(", "),
          dmTemplate: campaign.dmTemplate,
          publicReplyTemplate: campaign.publicReplyTemplate,
          isActive: campaign.isActive,
        }}
      />

      <DeleteCampaignButton campaignId={campaign.id} />

      <Link
        href="/ops/campaigns"
        className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Back to Campaigns
      </Link>
    </div>
  );
}
