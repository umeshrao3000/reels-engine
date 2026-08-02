import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseSignedRequest } from "@/lib/modules/meta/signed-request";

// Meta-initiated: registered as the app's data_deletion_request_url. Unlike
// deauthorize (soft-disconnect), this is a compliance deletion request —
// the SocialAccount row is actually deleted (Campaigns cascade with it).
// Meta requires a specific response shape: {url, confirmation_code}.
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
    logger.warn("instagram.oauth.data_deletion.invalid_signature");
    return NextResponse.json({ error: "Invalid signed_request." }, { status: 401 });
  }

  const confirmationCode = randomUUID();

  await prisma.socialAccount.deleteMany({ where: { instagramBusinessId: accountId } });
  logger.info("instagram.oauth.data_deletion.processed", { accountId, confirmationCode });

  const statusUrl = new URL(`/data-deletion-status?code=${confirmationCode}`, request.url).toString();
  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode });
}
