"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed.");
        return;
      }
      router.push("/ops/projects");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-white px-6 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col gap-3 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Admin</h1>
        <input
          type="password"
          autoFocus
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:focus:border-zinc-100"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !passcode}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
