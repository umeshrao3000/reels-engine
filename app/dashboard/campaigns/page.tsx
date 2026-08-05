import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { ToggleActiveButton } from "@/app/ops/(protected)/campaigns/_components/ToggleActiveButton";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/campaigns/page.tsx, scoped to this organization's
// own campaigns (via their SocialAccount) only. Reuses ToggleActiveButton
// with the customer apiBasePath — same component, same behavior, just a
// different API root.
export default async function CustomerCampaignsPage() {
  const context = await getCustomerContext();
  if (!context) redirect("/login");

  const campaigns = await prisma.campaign.findMany({
    where: { socialAccount: { organizationId: context.organization.id } },
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
          href="/dashboard/campaigns/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No campaigns yet.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Create a campaign to start matching comments and capturing leads.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="flex items-center justify-between gap-4 py-4">
              <Link href={`/dashboard/campaigns/${campaign.id}`} className="flex-1 hover:underline">
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
                <ToggleActiveButton
                  campaignId={campaign.id}
                  isActive={campaign.isActive}
                  apiBasePath="/api/customer/campaigns"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
