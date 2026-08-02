import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 py-16 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Not found</h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        That page or project doesn&apos;t exist, or the link may have expired.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Go home
      </Link>
    </div>
  );
}
