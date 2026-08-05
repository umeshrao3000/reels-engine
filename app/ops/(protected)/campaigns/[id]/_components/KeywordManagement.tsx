"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type KeywordRow = { id: string; value: string; isActive: boolean };

const FIELD_CLASS =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100";

export function KeywordManagement({
  campaignId,
  keywords,
  apiBasePath = "/api/admin/campaigns",
}: {
  campaignId: string;
  keywords: KeywordRow[];
  /** MR-3.2: lets the customer dashboard reuse this component against
   * /api/customer/campaigns instead of /api/admin/campaigns. Admin call
   * sites are unaffected — they don't pass this prop. */
  apiBasePath?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keywords;
    return keywords.filter((k) => k.value.includes(q));
  }, [keywords, search]);

  async function callApi(path: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return null;
      }
      router.refresh();
      return data;
    } catch {
      setError("Couldn't reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkText.trim()) return;
    const data = await callApi(`${apiBasePath}/${campaignId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: bulkText }),
    });
    if (data) {
      setBulkText("");
      const parts: string[] = [];
      if (data.created?.length) parts.push(`${data.created.length} added`);
      if (data.skipped?.length) parts.push(`${data.skipped.length} already existed`);
      if (data.rejectedTooLong?.length) parts.push(`${data.rejectedTooLong.length} too long (skipped)`);
      if (data.rejectedLimitReached?.length)
        parts.push(`${data.rejectedLimitReached.length} skipped (keyword limit reached)`);
      setNotice(parts.length ? parts.join(", ") : "Nothing to add.");
    }
  }

  async function handleToggle(keyword: KeywordRow) {
    await callApi(`${apiBasePath}/${campaignId}/keywords/${keyword.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !keyword.isActive }),
    });
  }

  async function handleDelete(keyword: KeywordRow) {
    const confirmed = window.confirm(`Delete keyword "${keyword.value}"? This cannot be undone.`);
    if (!confirmed) return;
    await callApi(`${apiBasePath}/${campaignId}/keywords/${keyword.id}`, { method: "DELETE" });
  }

  function startEdit(keyword: KeywordRow) {
    setEditingId(keyword.id);
    setEditValue(keyword.value);
    setError(null);
    setNotice(null);
  }

  async function saveEdit(keyword: KeywordRow) {
    if (!editValue.trim() || editValue.trim() === keyword.value) {
      setEditingId(null);
      return;
    }
    const data = await callApi(`${apiBasePath}/${campaignId}/keywords/${keyword.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: editValue }),
    });
    if (data) setEditingId(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Keyword Management ({keywords.length})
      </h2>

      <form onSubmit={handleBulkAdd} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Add keywords (comma or newline separated)
          <textarea
            rows={2}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="discount, promo code, link in bio"
            className={FIELD_CLASS}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !bulkText.trim()}
          className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? "Adding…" : "Add Keywords"}
        </button>
      </form>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="text-xs text-zinc-500 dark:text-zinc-400">{notice}</p>}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search keywords…"
        className={FIELD_CLASS}
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {keywords.length === 0 ? "No keywords yet." : "No keywords match your search."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {filtered.map((keyword) => (
            <li key={keyword.id} className="flex items-center justify-between gap-3 py-2">
              {editingId === keyword.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(keyword);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className={`${FIELD_CLASS} flex-1`}
                />
              ) : (
                <span
                  className={`text-sm ${
                    keyword.isActive
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-400 line-through dark:text-zinc-600"
                  }`}
                >
                  {keyword.value}
                </span>
              )}

              <div className="flex items-center gap-2">
                {editingId === keyword.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveEdit(keyword)}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggle(keyword)}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
                    >
                      {keyword.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(keyword)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(keyword)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
