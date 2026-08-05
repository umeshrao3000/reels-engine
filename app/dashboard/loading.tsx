// Next.js App Router route-segment loading boundary: shown automatically
// while any /dashboard/** server component is fetching data, replacing a
// blank screen during navigation between pages that each do their own
// server-side data fetch (overview stats, campaign lists, etc).
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    </div>
  );
}
