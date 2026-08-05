"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CampaignFormValues = {
  name: string;
  socialAccountId: string;
  instagramMediaId: string;
  dmTemplate: string;
  publicReplyTemplate: string;
  isActive: boolean;
};

const FIELD_CLASS =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100";
const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400";

export function CampaignForm({
  mode,
  campaignId,
  socialAccounts,
  initialValues,
  apiBasePath = "/api/admin/campaigns",
  successHref = "/ops/campaigns",
}: {
  mode: "create" | "edit";
  campaignId?: string;
  socialAccounts: { id: string; label: string }[];
  initialValues?: CampaignFormValues;
  /** MR-3.2: lets the customer dashboard reuse this component. Admin call
   * sites are unaffected — they don't pass these props. */
  apiBasePath?: string;
  successHref?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CampaignFormValues>(
    initialValues ?? {
      name: "",
      socialAccountId: socialAccounts[0]?.id ?? "",
      instagramMediaId: "",
      dmTemplate: "",
      publicReplyTemplate: "",
      isActive: true,
    }
  );
  const [initialKeywords, setInitialKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "create" ? { ...values, initialKeywords } : values;
      const res = await fetch(
        mode === "create" ? apiBasePath : `${apiBasePath}/${campaignId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed.");
        return;
      }
      router.push(successHref);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className={LABEL_CLASS}>
        Campaign name
        <input
          type="text"
          required
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      {mode === "create" ? (
        <label className={LABEL_CLASS}>
          Instagram account
          <select
            required
            value={values.socialAccountId}
            onChange={(e) => set("socialAccountId", e.target.value)}
            className={FIELD_CLASS}
          >
            {socialAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Account: {socialAccounts.find((a) => a.id === values.socialAccountId)?.label ?? "—"}
        </p>
      )}

      <label className={LABEL_CLASS}>
        Target Reel ID
        <input
          type="text"
          required
          value={values.instagramMediaId}
          onChange={(e) => set("instagramMediaId", e.target.value)}
          placeholder="The Instagram media id of the Reel"
          className={FIELD_CLASS}
        />
      </label>

      {mode === "create" ? (
        <label className={LABEL_CLASS}>
          Initial keywords (comma or newline separated)
          <textarea
            required
            rows={2}
            value={initialKeywords}
            onChange={(e) => setInitialKeywords(e.target.value)}
            placeholder={"deal, buy, link"}
            className={FIELD_CLASS}
          />
        </label>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Keywords are managed below, under Keyword Management.
        </p>
      )}

      <label className={LABEL_CLASS}>
        DM template
        <textarea
          required
          rows={3}
          value={values.dmTemplate}
          onChange={(e) => set("dmTemplate", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        Public reply template
        <textarea
          required
          rows={2}
          value={values.publicReplyTemplate}
          onChange={(e) => set("publicReplyTemplate", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
        Active
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? "Saving…" : mode === "create" ? "Create Campaign" : "Save Changes"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
