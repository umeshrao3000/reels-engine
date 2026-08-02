import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CampaignForm } from "@/app/ops/(protected)/campaigns/_components/CampaignForm";

export default async function NewCampaignPage() {
  const socialAccounts = await prisma.socialAccount.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Create Campaign</h1>

      {socialAccounts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No connected Instagram accounts.{" "}
          <Link href="/ops/social-accounts" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
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
        />
      )}

      <Link
        href="/ops/campaigns"
        className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Back to Campaigns
      </Link>
    </div>
  );
}
