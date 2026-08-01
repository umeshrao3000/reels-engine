import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { isValidAdminTransition } from "@/lib/modules/admin/project-status";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/projects/[id]">) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: {
    assignedEditor?: string | null;
    internalNotes?: string | null;
    editorNotes?: string | null;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const data: {
    assignedEditor?: string | null;
    internalNotes?: string | null;
    editorNotes?: string | null;
    status?: typeof project.status;
    completedAt?: Date;
    deliveredAt?: Date;
  } = {};

  if (body.assignedEditor !== undefined) data.assignedEditor = body.assignedEditor?.trim() || null;
  if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes?.trim() || null;
  if (body.editorNotes !== undefined) data.editorNotes = body.editorNotes?.trim() || null;

  if (body.status !== undefined) {
    if (!isValidAdminTransition(project.status, body.status as typeof project.status)) {
      return NextResponse.json(
        { error: `Cannot move project from ${project.status} to ${body.status}.` },
        { status: 409 }
      );
    }
    data.status = body.status as typeof project.status;
    if (body.status === "COMPLETED") data.completedAt = new Date();
    if (body.status === "DELIVERED") data.deliveredAt = new Date();
  }

  const updated = await prisma.project.update({ where: { id }, data });
  return NextResponse.json({ ok: true, status: updated.status });
}
