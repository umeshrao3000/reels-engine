import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REEL_MAKEOVER_AMOUNT_PAISE } from "@/lib/modules/payments/upi";
import {
  createRazorpayOrder,
  isRazorpayConfigured,
  RazorpayNotConfiguredError,
} from "@/lib/modules/payments/razorpay";

// Not wired into the customer UI yet — scaffolding only, per the decision to
// ship manual UPI as the active V1 payment method. Kept fully implemented so
// Razorpay can be switched on later by adding real keys, no code changes.
export async function POST(request: Request) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Razorpay is not configured on this environment." },
      { status: 503 }
    );
  }

  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.projectId) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: body.projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const order = await createRazorpayOrder({
      amountPaise: REEL_MAKEOVER_AMOUNT_PAISE,
      currency: "INR",
      receipt: project.id,
    });

    await prisma.payment.create({
      data: {
        projectId: project.id,
        amount: REEL_MAKEOVER_AMOUNT_PAISE,
        currency: "INR",
        provider: "razorpay",
        providerOrderId: order.id,
        status: "PENDING",
      },
    });

    return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    if (err instanceof RazorpayNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not create payment order." }, { status: 502 });
  }
}
