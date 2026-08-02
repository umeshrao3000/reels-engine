import { prisma } from "@/lib/prisma";
import { OWNER_TEST_PAYMENT_PROVIDER } from "@/lib/modules/testing/owner-test-mode";

export default async function AdminReportsPage() {
  // Owner-test-mode payments are excluded from revenue/verified-count so
  // repeated QA runs never inflate these operational numbers.
  const [totalProjects, statusCounts, pendingVerification, paidAgg, downloadAgg] =
    await Promise.all([
      prisma.project.count(),
      prisma.project.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.payment.count({ where: { status: "PENDING_VERIFICATION" } }),
      prisma.payment.aggregate({
        where: { status: "PAID", provider: { not: OWNER_TEST_PAYMENT_PROVIDER } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.project.aggregate({ _sum: { downloadCount: true } }),
    ]);

  const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const pendingJobs =
    (countByStatus.PAID ?? 0) + (countByStatus.IN_PROGRESS ?? 0) + (countByStatus.QUALITY_CHECK ?? 0);

  const rows: { label: string; value: string | number }[] = [
    { label: "Total projects", value: totalProjects },
    { label: "Draft (unpaid)", value: countByStatus.DRAFT ?? 0 },
    { label: "Pending jobs (paid, in progress, or in QC)", value: pendingJobs },
    { label: "Completed jobs", value: countByStatus.COMPLETED ?? 0 },
    { label: "Delivered jobs", value: countByStatus.DELIVERED ?? 0 },
    { label: "Payments awaiting verification", value: pendingVerification },
    { label: "Payments verified (count)", value: paidAgg._count },
    { label: "Revenue collected", value: `₹${((paidAgg._sum.amount ?? 0) / 100).toFixed(0)}` },
    { label: "Total downloads", value: downloadAgg._sum.downloadCount ?? 0 },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Reports</h1>
      <dl className="grid max-w-md grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">{row.label}</dt>
            <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
