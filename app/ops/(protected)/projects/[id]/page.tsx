import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { nextAdminStatus } from "@/lib/modules/admin/project-status";
import { ProjectAdminForm } from "@/app/ops/(protected)/projects/[id]/_components/ProjectAdminForm";
import { StatusAdvanceButton } from "@/app/ops/(protected)/projects/[id]/_components/StatusAdvanceButton";
import { ProcessedUploadForm } from "@/app/ops/(protected)/projects/[id]/_components/ProcessedUploadForm";

const NEXT_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "Start Editing",
  QUALITY_CHECK: "Send to Quality Check",
  COMPLETED: "Mark Completed",
  DELIVERED: "Mark Delivered",
};

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      uploads: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) notFound();

  const originals = project.uploads.filter((u) => u.kind === "ORIGINAL");
  const processed = project.uploads.filter((u) => u.kind === "PROCESSED");
  const next = nextAdminStatus(project.status);

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {project.customerName ?? project.id}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {project.email ?? "no email"} · {project.phone ?? "no phone"}
          </p>
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
            {project.id} · created {project.createdAt.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm text-zinc-900 dark:text-zinc-50">{project.status}</p>
          <a
            href={`/status/${project.shareToken}`}
            className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            View customer status page
          </a>
        </div>
      </div>

      {next && (
        <StatusAdvanceButton
          projectId={project.id}
          nextStatus={next}
          label={NEXT_STATUS_LABEL[next] ?? `Move to ${next}`}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Original uploads
        </h2>
        {originals.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {originals.map((upload) => (
              <li key={upload.id}>
                {upload.sourceType === "DIRECT" ? (
                  <a
                    href={`/api/storage/${encodeURIComponent(upload.location)}`}
                    className="text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    {upload.originalFileName ?? upload.location}
                  </a>
                ) : (
                  <a
                    href={upload.location}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    {upload.sourceType} link
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Processed files
        </h2>
        {processed.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None uploaded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {processed.map((upload) => (
              <li key={upload.id}>
                <a
                  href={`/api/storage/${encodeURIComponent(upload.location)}`}
                  className="text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  {upload.originalFileName ?? upload.location}
                </a>
              </li>
            ))}
          </ul>
        )}
        <ProcessedUploadForm projectId={project.id} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payments</h2>
        {project.payments.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No payments yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            {project.payments.map((payment) => (
              <li key={payment.id}>
                ₹{(payment.amount / 100).toFixed(0)} · {payment.status} · {payment.provider}
                {payment.utr ? ` · UTR ${payment.utr}` : ""} ·{" "}
                {payment.createdAt.toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Details</h2>
        <ProjectAdminForm
          projectId={project.id}
          assignedEditor={project.assignedEditor ?? ""}
          internalNotes={project.internalNotes ?? ""}
          editorNotes={project.editorNotes ?? ""}
        />
      </section>

      <Link
        href="/ops/projects"
        className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Back to Projects
      </Link>
    </div>
  );
}
