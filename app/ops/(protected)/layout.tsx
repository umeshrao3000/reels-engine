import Link from "next/link";
import { redirect } from "next/navigation";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

export default async function ProtectedOpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isRequestFromAdmin())) {
    redirect("/ops/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="flex items-center gap-6 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          reels-engine admin
        </span>
        <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/ops/dashboard" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Dashboard
          </Link>
          <Link href="/ops/projects" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Projects
          </Link>
          <Link href="/ops/payments" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Payments
          </Link>
          <Link href="/ops/reports" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Reports
          </Link>
          <Link
            href="/ops/social-accounts"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Social Accounts
          </Link>
          <Link href="/ops/campaigns" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Campaigns
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
