import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { CampaignForm } from "@/app/ops/(protected)/campaigns/_components/CampaignForm";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/campaigns/new/page.tsx — the Instagram account
// picker is restricted to this organization's own connected accounts.
export default async function CustomerNewCampaignPage() {
  const context = await getCustomerContext();
  if (!context) redirect("/login");

  const socialAccounts = await prisma.socialAccount.findMany({
    where: { organizationId: context.organization.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Create Campaign</h1>

      {socialAccounts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No connected Instagram accounts.{" "}
          <Link
            href="/dashboard/instagram"
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Connect one first
          </Link>
          .
        </p>
      ) : (
        <CampaignForm
          mode="create"
          socialAccounts={socialAccounts.map((account) => ({
            id: account.id,
            label: account.instagramUsername ?? account.instagramBusinessId,
          }))}
          apiBasePath="/api/customer/campaigns"
          successHref="/dashboard/campaigns"
        />
      )}

      <Link
        href="/dashboard/campaigns"
        className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Back to Campaigns
      </Link>
    </div>
  );
}
