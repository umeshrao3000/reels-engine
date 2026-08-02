import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REEL_MAKEOVER_AMOUNT_PAISE, UPI_ID } from "@/lib/modules/payments/upi";
import { checkRateLimit, getClientIp } from "@/lib/modules/security/rate-limit";

const SUBMIT_PAYMENT_LIMIT = 10;
const SUBMIT_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/payments">
) {
  const rateLimit = checkRateLimit(
    `submit-payment:${getClientIp(request)}`,
    SUBMIT_PAYMENT_LIMIT,
    SUBMIT_PAYMENT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let body: { utr?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const utr = body.utr?.trim();
  if (!utr || utr.length < 4 || utr.length > 40) {
    return NextResponse.json(
      { error: "Enter a valid UTR / transaction ID." },
      { status: 400 }
    );
  }

  const existing = await prisma.payment.findFirst({
    where: { projectId, status: { in: ["PENDING_VERIFICATION", "PAID"] } },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.status === "PAID"
            ? "This project is already paid."
            : "A payment for this project is already awaiting verification.",
      },
      { status: 409 }
    );
  }

  const payment = await prisma.payment.create({
    data: {
      projectId,
      amount: REEL_MAKEOVER_AMOUNT_PAISE,
      currency: "INR",
      provider: "manual_upi",
      upiId: UPI_ID,
      utr,
      status: "PENDING_VERIFICATION",
    },
  });

  return NextResponse.json({ paymentId: payment.id }, { status: 201 });
}
