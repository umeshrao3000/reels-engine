"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCampaignButton({
  campaignId,
  apiBasePath = "/api/admin/campaigns",
  backHref = "/ops/campaigns",
}: {
  campaignId: string;
  /** MR-3.2: lets the customer dashboard reuse this component. Admin call
   * sites are unaffected — they don't pass these props. */
  apiBasePath?: string;
  backHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "Delete this campaign? This also permanently deletes its conversion history (matched comments, DMs, replies). This cannot be undone."
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/${campaignId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't delete.");
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="self-start rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:border-red-600 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:border-red-500"
      >
        {busy ? "Deleting…" : "Delete Campaign"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
