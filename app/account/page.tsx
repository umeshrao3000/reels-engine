import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "./_components/SignOutButton";

// MR-3.1 (Beta SaaS Build Program) deliberately stops here: this proves
// sign-up/login/session-management work end to end, and nothing more.
// Campaigns, Instagram connection, analytics, and billing are later,
// separately-approved milestones (MR-3.2 onward) — this page is not an
// unfinished dashboard, it's this milestone's actual, intended scope.
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 py-16 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">You&apos;re signed in</h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{session.user.email}</p>
      <SignOutButton />
    </div>
  );
}
