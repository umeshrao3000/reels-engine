"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ProcessedUploadForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/admin/projects/${projectId}/uploads`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Upload failed.");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="text-xs text-zinc-600 dark:text-zinc-400"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {busy ? "Uploading…" : "Upload finished file"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
