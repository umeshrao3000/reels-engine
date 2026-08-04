"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Always show the same confirmation regardless of outcome — the
    // request itself never reveals whether an account exists for this
    // email (better-auth's own enumeration-safety guarantee at the API
    // level; this UI just doesn't undo that by branching on the result).
    await requestPasswordReset({ email, redirectTo: "/reset-password" });
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 py-16 text-center dark:bg-black">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Check your email</h1>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          If an account exists for {email}, we&apos;ve sent instructions to reset your password.
        </p>
        <Link href="/login" className="text-sm font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-white px-6 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Reset your password</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enter your account email and we&apos;ll send you a link to reset your password.
        </p>

        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:focus:border-zinc-100"
        />

        <button
          type="submit"
          disabled={submitting || !email}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>

        <Link href="/login" className="text-center text-xs text-zinc-500 underline dark:text-zinc-400">
          Back to log in
        </Link>
      </form>
    </div>
  );
}
