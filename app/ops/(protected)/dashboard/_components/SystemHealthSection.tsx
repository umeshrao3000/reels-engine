const LEVEL_CLASS: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  expired: "text-red-600 dark:text-red-400",
  unknown: "text-zinc-500 dark:text-zinc-400",
};

export function SystemHealthSection({
  oauthConnected,
  webhookConfigured,
  receivingEvents,
  tokenWarnings,
  lastWebhookReceivedAt,
  lastAutomationExecutedAt,
}: {
  oauthConnected: boolean;
  webhookConfigured: boolean;
  receivingEvents: boolean;
  tokenWarnings: { accountLabel: string; level: string; message: string }[];
  lastWebhookReceivedAt: Date | null;
  lastAutomationExecutedAt: Date | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">System Health</h2>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <HealthRow label="OAuth Connected" ok={oauthConnected} />
        <HealthRow
          label="Webhook Endpoint"
          ok={webhookConfigured}
          detail={webhookConfigured ? (receivingEvents ? "configured, receiving events" : "configured, no events yet") : "not configured"}
        />
        <HealthRow
          label="Last Webhook Received"
          detail={lastWebhookReceivedAt ? lastWebhookReceivedAt.toLocaleString() : "never"}
        />
        <HealthRow
          label="Last Automation Executed"
          detail={lastAutomationExecutedAt ? lastAutomationExecutedAt.toLocaleString() : "never"}
        />
      </dl>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Token Expiry</h3>
        {tokenWarnings.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No connected accounts.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {tokenWarnings.map((warning) => (
              <li key={warning.accountLabel} className="flex items-center gap-2">
                <span className="text-zinc-700 dark:text-zinc-300">{warning.accountLabel}</span>
                <span className={LEVEL_CLASS[warning.level] ?? LEVEL_CLASS.unknown}>
                  {warning.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={ok === undefined ? "text-zinc-700 dark:text-zinc-300" : ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
        {detail ?? (ok ? "Yes" : "No")}
      </dd>
    </div>
  );
}
