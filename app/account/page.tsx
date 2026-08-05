import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "./_components/SignOutButton";

// MR-3.1 (Beta SaaS Build Program) deliberately stopped here: this proved
// sign-up/login/session-management work end to end, and nothing more.
// MR-3.2 built the actual workspace (Instagram connection, campaigns,
// analytics) at /dashboard — this page stays exactly what it was, plus
// one link into that new surface.
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 py-16 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">You&apos;re signed in</h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{session.user.email}</p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Go to your workspace
      </Link>
      <SignOutButton />
    </div>
  );
}
