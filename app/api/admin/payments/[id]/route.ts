import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/payments/[id]">
) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id: paymentId } = await ctx.params;

  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action !== "verify" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'verify' or 'reject'." }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }
  if (payment.status !== "PENDING_VERIFICATION") {
    return NextResponse.json(
      { error: `Payment is already ${payment.status.toLowerCase()}.` },
      { status: 409 }
    );
  }

  if (body.action === "verify") {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: paymentId },
        data: { status: "PAID", verifiedAt: new Date() },
      }),
      prisma.project.update({
        where: { id: payment.projectId },
        data: { status: "PAID" },
      }),
    ]);
  } else {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "REJECTED", rejectionReason: body.reason?.trim() || null },
    });
  }

  return NextResponse.json({ ok: true });
}
