import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageService } from "@/lib/modules/storage";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

// Dev-local storage only — revisit once production storage is chosen.
const MAX_PROCESSED_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/admin/projects/[id]/uploads">
) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Provide a file." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Provide a file." }, { status: 400 });
  }
  if (file.size > MAX_PROCESSED_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageService();
  const key = `projects/${id}/processed/${randomUUID()}/${file.name}`;
  const stored = await storage.put(key, buffer, file.type || undefined);

  const upload = await prisma.upload.create({
    data: {
      projectId: id,
      kind: "PROCESSED",
      sourceType: "DIRECT",
      location: stored.key,
      originalFileName: file.name,
      mimeType: file.type || null,
      sizeBytes: stored.sizeBytes,
    },
  });

  return NextResponse.json({ ok: true, uploadId: upload.id }, { status: 201 });
}
