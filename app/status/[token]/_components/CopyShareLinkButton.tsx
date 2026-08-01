"use client";

import { useState } from "react";

export function CopyShareLinkButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — nothing to fall back to gracefully here.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
    >
      {copied ? "Link copied" : "Copy share link"}
    </button>
  );
}
