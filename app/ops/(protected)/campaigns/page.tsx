import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ToggleActiveButton } from "./_components/ToggleActiveButton";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { socialAccount: { select: { instagramUsername: true, instagramBusinessId: true } } },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Campaigns ({campaigns.length})
        </h1>
        <Link
          href="/ops/campaigns/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No campaigns yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="flex items-center justify-between gap-4 py-4">
              <Link href={`/ops/campaigns/${campaign.id}`} className="flex-1 hover:underline">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{campaign.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {campaign.socialAccount.instagramUsername ?? campaign.socialAccount.instagramBusinessId}
                  {" · Reel "}
                  {campaign.instagramMediaId}
                  {" · "}
                  {campaign.triggerKeywords.join(", ")}
                  {" · created "}
                  {campaign.createdAt.toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {campaign.isActive ? "ACTIVE" : "INACTIVE"}
                </span>
                <ToggleActiveButton campaignId={campaign.id} isActive={campaign.isActive} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
