import Link from "next/link";
import { ToggleActiveButton } from "@/app/ops/(protected)/campaigns/_components/ToggleActiveButton";

export function CampaignOverviewSection({
  campaigns,
}: {
  campaigns: {
    id: string;
    name: string;
    instagramMediaId: string;
    isActive: boolean;
    triggerKeywords: string[];
    lastActivityAt: Date | null;
  }[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Campaign Overview</h2>

      {campaigns.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No campaigns yet.{" "}
          <Link href="/ops/campaigns/new" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            Create one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{campaign.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Reel {campaign.instagramMediaId} · {campaign.triggerKeywords.join(", ")}
                  {" · last activity "}
                  {campaign.lastActivityAt ? campaign.lastActivityAt.toLocaleString() : "never"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {campaign.isActive ? "ACTIVE" : "INACTIVE"}
                </span>
                <Link
                  href={`/ops/campaigns/${campaign.id}`}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
                >
                  Edit
                </Link>
                <ToggleActiveButton campaignId={campaign.id} isActive={campaign.isActive} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
