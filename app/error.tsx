"use client"; // Error boundaries must be Client Components

import Link from "next/link";

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 py-16 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Something went wrong
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        Please try again. If the problem continues, come back in a few minutes.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
