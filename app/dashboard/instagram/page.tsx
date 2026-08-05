import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { DisconnectButton } from "./_components/DisconnectButton";

const STATUS_MESSAGES: Record<string, { text: string; tone: "success" | "error" }> = {
  connected: { text: "Instagram account connected.", tone: "success" },
  connected_subscribe_failed: {
    text: "Account connected, but webhook activation failed — comments won't arrive yet. Try disconnecting and reconnecting.",
    tone: "error",
  },
  denied: { text: "Connection was cancelled.", tone: "error" },
  invalid_state: { text: "Connection request expired or was invalid. Try again.", tone: "error" },
  missing_code: { text: "Instagram didn't return an authorization code. Try again.", tone: "error" },
  token_exchange_failed: { text: "Couldn't complete the connection with Instagram. Try again.", tone: "error" },
  account_fetch_failed: { text: "Connected, but couldn't read the account's details. Try again.", tone: "error" },
  // MR-3.2: distinct outcome — this Instagram account is already connected
  // under a different organization (or the admin surface); see the
  // conflict check in app/api/admin/instagram/callback/route.ts.
  already_connected: {
    text: "That Instagram account is already connected elsewhere and can't be connected here.",
    tone: "error",
  },
};

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/ops/(protected)/social-accounts/page.tsx, scoped to this
// organization's own connected accounts only.
export default async function CustomerInstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const context = await getCustomerContext();
  if (!context) redirect("/login");

  const { status } = await searchParams;
  const message = status ? STATUS_MESSAGES[status] : undefined;

  const accounts = await prisma.socialAccount.findMany({
    where: { organizationId: context.organization.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campaigns: true } } },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Instagram Accounts ({accounts.length})
        </h1>
        <a
          href="/api/customer/instagram/connect"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Connect Instagram Account
        </a>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.tone === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No accounts connected yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {account.instagramUsername ?? account.instagramBusinessId}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {account._count.campaigns} campaign{account._count.campaigns === 1 ? "" : "s"}
                  {account.tokenExpiresAt
                    ? ` · token expires ${account.tokenExpiresAt.toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {account.status}
                </span>
                {account.status === "ACTIVE" && <DisconnectButton socialAccountId={account.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
