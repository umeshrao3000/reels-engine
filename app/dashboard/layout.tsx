import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/modules/organizations/session";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/layout.tsx — same shape (session gate + shared
// nav shell), different identity system (better-auth, not ADMIN_PASSCODE).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCustomerContext();
  if (!context) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="flex items-center gap-6 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {context.organization.name}
        </span>
        <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/dashboard" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Overview
          </Link>
          <Link href="/dashboard/instagram" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Instagram
          </Link>
          <Link href="/dashboard/campaigns" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Campaigns
          </Link>
          <Link href="/account" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Account
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
