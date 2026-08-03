export function LeadOverviewSection({
  leads,
}: {
  leads: {
    id: string;
    handle: string | null;
    instagramUserId: string;
    lastInteractedAt: Date;
    campaignName: string | null;
    status: string | null;
  }[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Lead Overview</h2>

      {leads.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No leads yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {leads.map((lead) => (
            <li key={lead.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {lead.handle ?? lead.instagramUserId}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {lead.instagramUserId} · {lead.campaignName ?? "no campaign"} · last interaction{" "}
                  {lead.lastInteractedAt.toLocaleString()}
                </p>
              </div>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {lead.status ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
