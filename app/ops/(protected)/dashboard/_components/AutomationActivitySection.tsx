import type { DeliveryStatus } from "@prisma/client";
import { dmStatusLabel, publicReplyStatusLabel } from "../_lib/derive-status";

export function AutomationActivitySection({
  logs,
}: {
  logs: {
    id: string;
    createdAt: Date;
    campaignName: string | null;
    instagramHandle: string | null;
    matchedKeyword: string | null;
    status: DeliveryStatus;
    dmSentAt: Date | null;
    publicRepliedAt: Date | null;
  }[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Automation Activity</h2>

      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No automation runs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th className="py-1 pr-4 font-medium">Time</th>
                <th className="py-1 pr-4 font-medium">Campaign</th>
                <th className="py-1 pr-4 font-medium">Instagram User</th>
                <th className="py-1 pr-4 font-medium">Keyword</th>
                <th className="py-1 pr-4 font-medium">DM</th>
                <th className="py-1 pr-4 font-medium">Public Reply</th>
                <th className="py-1 font-medium">Final Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {logs.map((log) => (
                <tr key={log.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="py-2 pr-4 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                    {log.createdAt.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{log.campaignName ?? "—"}</td>
                  <td className="py-2 pr-4">{log.instagramHandle ?? "—"}</td>
                  <td className="py-2 pr-4">{log.matchedKeyword ?? "—"}</td>
                  <td className="py-2 pr-4">{dmStatusLabel(log)}</td>
                  <td className="py-2 pr-4">{publicReplyStatusLabel(log)}</td>
                  <td className="py-2 font-mono text-xs">{log.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
