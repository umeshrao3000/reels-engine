import Link from "next/link";
import { notFound } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CopyShareLinkButton } from "@/app/status/[token]/_components/CopyShareLinkButton";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Awaiting payment",
  PAID: "Queued for editing",
  IN_PROGRESS: "Being edited",
  QUALITY_CHECK: "In quality review",
  COMPLETED: "Ready to download",
  DELIVERED: "Delivered",
};

const STATUS_DETAIL: Record<ProjectStatus, string> = {
  DRAFT: "We haven't received your payment yet.",
  PAID: "Payment confirmed — your Reel is in the queue.",
  IN_PROGRESS: "Our editor is working on your Reel now.",
  QUALITY_CHECK: "Your Reel is finished and going through a final quality check.",
  COMPLETED: "Your finished Reel is ready below.",
  DELIVERED: "Your finished Reel is ready below.",
};

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const project = await prisma.project.findUnique({
    where: { shareToken: token },
    include: { uploads: { where: { kind: "PROCESSED" }, orderBy: { createdAt: "desc" } } },
  });

  if (!project) notFound();

  const isReady = project.status === "COMPLETED" || project.status === "DELIVERED";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-white px-6 py-16 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {STATUS_LABEL[project.status]}
      </h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">{STATUS_DETAIL[project.status]}</p>

      {project.status === "DRAFT" && (
        <Link
          href={`/pay/${project.id}`}
          className="rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Continue to Payment
        </Link>
      )}

      {isReady && (
        <div className="flex w-full max-w-sm flex-col gap-2">
          {project.uploads.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Marked complete — final file will appear here shortly.
            </p>
          ) : (
            project.uploads.map((upload) => (
              <a
                key={upload.id}
                href={`/api/deliver/${project.shareToken}/${upload.id}`}
                className="rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Download {upload.originalFileName ?? "finished Reel"}
              </a>
            ))
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <CopyShareLinkButton />
        <Link
          href="/upload"
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Upload another Reel
        </Link>
      </div>
    </div>
  );
}
