import { createHmac, timingSafeEqual } from "node:crypto";

export class RazorpayNotConfiguredError extends Error {
  constructor() {
    super("Razorpay is not configured on this environment.");
    this.name = "RazorpayNotConfiguredError";
  }
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function isRazorpayWebhookConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
};

/**
 * Creates a Razorpay order via their REST API directly (no SDK dependency —
 * it's a single Basic-Auth POST). Throws RazorpayNotConfiguredError if keys
 * aren't set; never falls back to a placeholder credential.
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
}): Promise<RazorpayOrder> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new RazorpayNotConfiguredError();
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${response.status}): ${detail}`);
  }

  return response.json();
}

/**
 * Verifies Razorpay's webhook signature (HMAC-SHA256 of the raw body using
 * the webhook secret). Callers must pass the *raw* request body text —
 * signature verification fails silently if the body is re-serialized.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
