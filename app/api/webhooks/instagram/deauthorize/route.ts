import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseSignedRequest } from "@/lib/modules/meta/signed-request";

// Meta-initiated: called when the user revokes access from Instagram's own
// settings (not through this app). Meta requires this endpoint to be
// registered as the app's deauthorize_callback_url.
export async function POST(request: Request) {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "Missing signed_request." }, { status: 400 });
  }

  const accountId = parseSignedRequest(signedRequest, secret);
  if (!accountId) {
    logger.warn("instagram.oauth.deauthorize.invalid_signature");
    return NextResponse.json({ error: "Invalid signed_request." }, { status: 401 });
  }

  await prisma.socialAccount.updateMany({
    where: { instagramBusinessId: accountId },
    data: { status: "DISCONNECTED" },
  });
  logger.info("instagram.oauth.deauthorize.processed", { accountId });

  return NextResponse.json({ ok: true });
}
