import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { SettingsForm } from "./_components/SettingsForm";

export default async function SettingsPage() {
  const context = await getCustomerContext();
  if (!context) redirect("/login");

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
      <SettingsForm name={context.user.name} email={context.user.email} />
    </div>
  );
}
