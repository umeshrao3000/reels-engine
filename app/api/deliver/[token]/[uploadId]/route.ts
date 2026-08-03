import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/modules/storage";

// Customer-facing download, scoped to one project via its unguessable
// shareToken. Only ever serves PROCESSED uploads — a customer can never
// use this to reach their own original upload or another project's files.
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/deliver/[token]/[uploadId]">
) {
  const { token, uploadId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { shareToken: token } });
  if (!project) {
    return new Response("Not found", { status: 404 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.projectId !== project.id || upload.kind !== "PROCESSED") {
    return new Response("Not found", { status: 404 });
  }

  const storage = getStorageProvider();
  if (!(await storage.exists(upload.location))) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await storage.getBuffer(upload.location);
  await prisma.project.update({
    where: { id: project.id },
    data: { downloadCount: { increment: 1 } },
  });

  const filename = upload.originalFileName ?? "reel-makeover.mp4";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": upload.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
