import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { redirect } from "next/navigation";

// MR-3.2 (Single Organization Ownership): the customer's home after
// sign-in. Deliberately plain stat tiles, not a chart-heavy analytics
// build — "Campaign redesign"/"Instagram redesign"/general UI polish are
// explicitly out of scope for this milestone. Every count below is scoped
// to this organization; see lib/modules/organizations/ownership.ts for
// the same boundary enforced on writes.
export default async function DashboardOverviewPage() {
  const context = await getCustomerContext();
  if (!context) redirect("/login");

  const organizationId = context.organization.id;

  const [connectedAccounts, campaignCount, leadsEngaged, successfulConversions] = await Promise.all([
    prisma.socialAccount.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.campaign.count({ where: { socialAccount: { organizationId } } }),
    prisma.conversionLog.findMany({
      where: { organizationId, leadId: { not: null } },
      distinct: ["leadId"],
      select: { leadId: true },
    }),
    prisma.conversionLog.count({ where: { organizationId, status: "SUCCESS" } }),
  ]);

  const tiles = [
    { label: "Connected Instagram accounts", value: connectedAccounts, href: "/dashboard/instagram" },
    { label: "Campaigns", value: campaignCount, href: "/dashboard/campaigns" },
    { label: "Leads engaged", value: leadsEngaged.length, href: "/dashboard/campaigns" },
    { label: "Successful conversions", value: successfulConversions, href: "/dashboard/campaigns" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Welcome, {context.user.name}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{context.organization.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-zinc-200 p-4 hover:border-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-100"
          >
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{tile.value}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{tile.label}</p>
          </Link>
        ))}
      </div>

      {connectedAccounts === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/dashboard/instagram" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            Connect your Instagram account
          </Link>{" "}
          to start capturing leads.
        </p>
      )}
    </div>
  );
}
