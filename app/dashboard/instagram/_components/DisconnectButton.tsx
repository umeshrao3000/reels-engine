"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/social-accounts/_components/DisconnectButton.tsx,
// pointed at /api/customer/instagram instead of /api/admin/instagram.
export function DisconnectButton({ socialAccountId }: { socialAccountId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = window.confirm("Disconnect this Instagram account? Its campaigns will stop matching new comments.");
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer/instagram/${socialAccountId}/disconnect`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't disconnect.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
      >
        {busy ? "…" : "Disconnect"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
