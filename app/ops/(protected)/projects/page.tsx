import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STATUS_FILTERS: { label: string; value: ProjectStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Paid", value: "PAID" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Quality Check", value: "QUALITY_CHECK" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Delivered", value: "DELIVERED" },
];

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = STATUS_FILTERS.some((f) => f.value === status)
    ? (status as ProjectStatus)
    : "ALL";

  const projects = await prisma.project.findMany({
    where: activeStatus === "ALL" ? {} : { status: activeStatus },
    orderBy: { createdAt: "desc" },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Projects ({projects.length})
      </h1>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "ALL" ? "/ops/projects" : `/ops/projects?status=${filter.value}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeStatus === filter.value
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-white dark:text-zinc-900"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No projects here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {projects.map((project) => (
            <li key={project.id} className="py-4">
              <Link
                href={`/ops/projects/${project.id}`}
                className="flex items-center justify-between gap-4 text-sm hover:underline"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {project.customerName ?? project.id}
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {project.createdAt.toLocaleString()}
                    {project.assignedEditor ? ` · Editor: ${project.assignedEditor}` : ""}
                  </p>
                </div>
                <div className="text-right text-zinc-500 dark:text-zinc-400">
                  <p className="font-mono text-xs">{project.status}</p>
                  {project.payments[0] && (
                    <p className="text-xs">{project.payments[0].status}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
