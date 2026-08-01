import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { PaymentActions } from "@/app/ops/payments/_components/PaymentActions";

export default async function AdminPaymentsPage() {
  if (!(await isRequestFromAdmin())) {
    redirect("/ops/login");
  }

  const pending = await prisma.payment.findMany({
    where: { status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "asc" },
    include: { project: { include: { uploads: { take: 1, orderBy: { createdAt: "desc" } } } } },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 bg-white px-6 py-10 dark:bg-black">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Payments awaiting verification ({pending.length})
      </h1>

      {pending.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing to review.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {pending.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-4 py-4">
              <div className="text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  Project {payment.projectId}
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {payment.project.uploads[0]?.originalFileName ??
                    payment.project.uploads[0]?.location ??
                    "(no upload found)"}
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  UTR: <span className="font-mono">{payment.utr}</span> · ₹
                  {(payment.amount / 100).toFixed(0)} · {payment.createdAt.toLocaleString()}
                </p>
              </div>
              <PaymentActions paymentId={payment.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
