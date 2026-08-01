"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectAdminForm({
  projectId,
  assignedEditor,
  internalNotes,
  editorNotes,
}: {
  projectId: string;
  assignedEditor: string;
  internalNotes: string;
  editorNotes: string;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState(assignedEditor);
  const [notes, setNotes] = useState(internalNotes);
  const [edNotes, setEdNotes] = useState(editorNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedEditor: editor,
          internalNotes: notes,
          editorNotes: edNotes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Assigned editor
        <input
          type="text"
          value={editor}
          onChange={(e) => setEditor(e.target.value)}
          placeholder="Unassigned"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Internal notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Editor notes
        <textarea
          value={edNotes}
          onChange={(e) => setEdNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-zinc-500 dark:text-zinc-400">Saved</span>}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
