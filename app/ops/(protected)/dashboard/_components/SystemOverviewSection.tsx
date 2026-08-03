import Link from "next/link";
import type { SocialAccount } from "@prisma/client";

export function SystemOverviewSection({
  socialAccounts,
  activeCampaignCount,
  totalLeads,
  totalConversionLogs,
  recentActivity,
}: {
  socialAccounts: SocialAccount[];
  activeCampaignCount: number;
  totalLeads: number;
  totalConversionLogs: number;
  recentActivity: { id: string; createdAt: Date; status: string; campaignName: string | null }[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">System Overview</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Connected Accounts" value={socialAccounts.length} />
        <StatTile label="Active Campaigns" value={activeCampaignCount} />
        <StatTile label="Total Leads" value={totalLeads} />
        <StatTile label="Total Conversion Logs" value={totalConversionLogs} />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Connected Instagram Account{socialAccounts.length === 1 ? "" : "s"}
        </h3>
        {socialAccounts.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            None yet.{" "}
            <Link href="/ops/social-accounts" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
              Connect one
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {socialAccounts.map((account) => (
              <li key={account.id} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">
                  {account.instagramUsername ?? account.instagramBusinessId}
                </span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {account.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            {recentActivity.map((log) => (
              <li key={log.id}>
                {log.createdAt.toLocaleString()} · {log.campaignName ?? "no campaign"} ·{" "}
                <span className="font-mono text-xs">{log.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}
