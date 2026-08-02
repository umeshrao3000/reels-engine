import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

// Soft-disconnect: sets status DISCONNECTED, never deletes the row —
// Campaigns cascade-delete from SocialAccount, and we don't want to lose
// campaign history/config over a disconnect. Does not call Meta's
// deauthorize; the account simply stops being used going forward.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.socialAccount.update({
      where: { id },
      data: { status: "DISCONNECTED" },
    });
  } catch {
    return NextResponse.json({ error: "Social account not found." }, { status: 404 });
  }

  logger.info("instagram.oauth.disconnected", { socialAccountId: id });
  return NextResponse.json({ ok: true });
}
