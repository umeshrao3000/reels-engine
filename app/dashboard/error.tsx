"use client";

// Next.js App Router route-segment error boundary: catches an unhandled
// error anywhere under /dashboard/** (a failed query, an unexpected
// exception) and shows a recoverable screen instead of the framework's
// default crash page. Client component — required by Next.js for
// error.tsx files.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Something went wrong</h1>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {error.message || "An unexpected error occurred loading this page."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Try again
      </button>
    </div>
  );
}
