import Link from "next/link";
import type { DeliveryStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dmStatusLabel, publicReplyStatusLabel, tokenExpiryStatus } from "@/lib/modules/monitoring/derive-status";
import { eventTypeLabel, extractMediaIdFromRawPayload } from "@/lib/modules/monitoring/webhook-event-view";

const DELIVERY_STATUSES: DeliveryStatus[] = [
  "PENDING",
  "MATCHED",
  "DM_SENT",
  "PUBLIC_REPLIED",
  "SUCCESS",
  "FAILED",
  "SKIPPED",
];

function isDeliveryStatus(value: string): value is DeliveryStatus {
  return (DELIVERY_STATUSES as string[]).includes(value);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

const FIELD_CLASS =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100";
const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ campaignId?: string; status?: string; date?: string; instagramUser?: string }>;
}) {
  const params = await searchParams;
  const campaignId = params.campaignId?.trim() || undefined;
  const status = params.status && isDeliveryStatus(params.status) ? params.status : undefined;
  const date = params.date && isValidDate(params.date) ? params.date : undefined;
  const instagramUser = params.instagramUser?.trim() || undefined;
  const hasFilters = Boolean(campaignId || status || date || instagramUser);

  const where: Prisma.ConversionLogWhereInput = {};
  if (campaignId) where.campaignId = campaignId;
  if (status) where.status = status;
  if (instagramUser) {
    where.OR = [
      { instagramUserId: { contains: instagramUser, mode: "insensitive" } },
      { lead: { handle: { contains: instagramUser, mode: "insensitive" } } },
    ];
  }
  if (date) {
    where.createdAt = {
      gte: new Date(`${date}T00:00:00.000Z`),
      lte: new Date(`${date}T23:59:59.999Z`),
    };
  }

  const [campaigns, activityRows, errorRows, socialAccounts, lastWebhook, lastSuccess] = await Promise.all([
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.conversionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        campaign: { select: { name: true } },
        lead: { select: { handle: true, instagramUserId: true } },
      },
    }),
    prisma.conversionLog.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { campaign: { select: { name: true } } },
    }),
    prisma.socialAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.conversionLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.conversionLog.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const webhookConfigured = Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN);
  const connectedAccounts = socialAccounts.filter((a) => a.status === "ACTIVE");

  return (
    <div className="flex flex-1 flex-col gap-10 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Monitoring</h1>

      {/* 3. System Status */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">System Status</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <StatusRow
            label="Instagram Connection"
            ok={connectedAccounts.length > 0}
            detail={
              connectedAccounts.length > 0
                ? `Connected (${connectedAccounts.length} account${connectedAccounts.length === 1 ? "" : "s"})`
                : "Not connected"
            }
          />
          <StatusRow
            label="Webhook"
            ok={webhookConfigured}
            detail={webhookConfigured ? "Configured" : "Not configured"}
          />
          <StatusRow
            label="Last Webhook Received"
            detail={lastWebhook ? lastWebhook.createdAt.toLocaleString() : "never"}
          />
          <StatusRow
            label="Last Successful Automation"
            detail={lastSuccess ? lastSuccess.createdAt.toLocaleString() : "never"}
          />
        </dl>

        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">OAuth Status</h3>
          {socialAccounts.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No connected accounts.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {socialAccounts.map((account) => {
                const expiry = tokenExpiryStatus(account.tokenExpiresAt);
                return (
                  <li key={account.id} className="flex items-center gap-2">
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {account.instagramUsername ?? account.instagramBusinessId}
                    </span>
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{account.status}</span>
                    {account.status === "ACTIVE" && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">· {expiry.message}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* 5. Search & Filter — applies to Recent Webhook Events + Automation Activity below */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Search &amp; Filter</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className={LABEL_CLASS}>
            Campaign
            <select name="campaignId" defaultValue={campaignId ?? ""} className={FIELD_CLASS}>
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Status
            <select name="status" defaultValue={status ?? ""} className={FIELD_CLASS}>
              <option value="">All statuses</option>
              {DELIVERY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Date
            <input type="date" name="date" defaultValue={date ?? ""} className={FIELD_CLASS} />
          </label>
          <label className={LABEL_CLASS}>
            Instagram User
            <input
              type="text"
              name="instagramUser"
              defaultValue={instagramUser ?? ""}
              placeholder="handle or user id"
              className={FIELD_CLASS}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Apply
          </button>
          {hasFilters && (
            <Link
              href="/ops/monitoring"
              className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Clear filters
            </Link>
          )}
        </form>
      </section>

      {/* 1. Recent Webhook Events */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Recent Webhook Events ({activityRows.length})
        </h2>
        {activityRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No webhook events match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="py-1 pr-4 font-medium">Timestamp</th>
                  <th className="py-1 pr-4 font-medium">Event Type</th>
                  <th className="py-1 pr-4 font-medium">Reel ID</th>
                  <th className="py-1 pr-4 font-medium">Comment ID</th>
                  <th className="py-1 font-medium">Processing Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activityRows.map((log) => (
                  <tr key={log.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{eventTypeLabel()}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {extractMediaIdFromRawPayload(log.rawPayload) ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{log.commentId}</td>
                    <td className="py-2 font-mono text-xs">{log.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Automation Activity */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Automation Activity ({activityRows.length})
        </h2>
        {activityRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No automation activity matches these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="py-1 pr-4 font-medium">Campaign</th>
                  <th className="py-1 pr-4 font-medium">Matched Keyword</th>
                  <th className="py-1 pr-4 font-medium">Lead</th>
                  <th className="py-1 pr-4 font-medium">DM Status</th>
                  <th className="py-1 pr-4 font-medium">Public Reply Status</th>
                  <th className="py-1 font-medium">Final Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activityRows.map((log) => (
                  <tr key={log.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="py-2 pr-4">{log.campaign?.name ?? "—"}</td>
                    <td className="py-2 pr-4">{log.matchedKeyword ?? "—"}</td>
                    <td className="py-2 pr-4">{log.lead?.handle ?? log.instagramUserId ?? "—"}</td>
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

      {/* 4. Error Monitoring — always shows current failures, independent of the filters above */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Error Monitoring ({errorRows.length})
        </h2>
        {errorRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No failed automations.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="py-1 pr-4 font-medium">Timestamp</th>
                  <th className="py-1 pr-4 font-medium">Campaign</th>
                  <th className="py-1 pr-4 font-medium">Failure Reason</th>
                  <th className="py-1 font-medium">Retry Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {errorRows.map((log) => (
                  <tr key={log.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{log.campaign?.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-red-600 dark:text-red-400">{log.errorMessage ?? "—"}</td>
                    <td className="py-2 font-mono text-xs">{log.retryCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok?: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={
          ok === undefined
            ? "text-zinc-700 dark:text-zinc-300"
            : ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
        }
      >
        {detail}
      </dd>
    </div>
  );
}
