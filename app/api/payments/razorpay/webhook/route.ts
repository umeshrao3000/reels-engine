import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isRazorpayWebhookConfigured,
  verifyRazorpayWebhookSignature,
} from "@/lib/modules/payments/razorpay";

// Not wired into the customer UI yet — scaffolding only (see orders/route.ts).
// Still a real, correct endpoint: Razorpay's dashboard can point at this URL
// as soon as a webhook secret is configured.
export async function POST(request: Request) {
  if (!isRazorpayWebhookConfigured()) {
    return NextResponse.json(
      { error: "Razorpay webhook is not configured on this environment." },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (event.event !== "payment.captured") {
    // Acknowledge other event types without acting on them.
    return NextResponse.json({ ok: true });
  }

  const paymentEntity = event.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id in payload." }, { status: 400 });
  }

  const payment = await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
  if (!payment) {
    return NextResponse.json({ error: "No matching payment for this order." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", providerPaymentId: paymentEntity?.id, verifiedAt: new Date() },
    }),
    prisma.project.update({
      where: { id: payment.projectId },
      data: { status: "PAID" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
