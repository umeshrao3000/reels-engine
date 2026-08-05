import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { SignOutButton } from "@/app/account/_components/SignOutButton";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/layout.tsx — same shape (session gate + shared
// nav shell), different identity system (better-auth, not ADMIN_PASSCODE).
// Customer Experience Sprint: flex-wrap so the nav degrades to a second
// row on narrow viewports instead of overflowing; Settings + Sign out
// added so the whole customer journey (including logout) stays inside
// this shell rather than bouncing through /account.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCustomerContext();
  if (!context) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {context.organization.name}
          </span>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/dashboard" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Overview
            </Link>
            <Link href="/dashboard/instagram" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Instagram
            </Link>
            <Link href="/dashboard/campaigns" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Campaigns
            </Link>
            <Link href="/dashboard/settings" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Settings
            </Link>
          </nav>
        </div>
        <SignOutButton className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100" />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
