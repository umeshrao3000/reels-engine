import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { assertSocialAccountOwnership } from "@/lib/modules/organizations/ownership";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/api/admin/instagram/[id]/disconnect — same soft-disconnect
// semantics (status DISCONNECTED, row kept, Meta not called), gated by
// organization ownership instead of ADMIN_PASSCODE.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const account = await assertSocialAccountOwnership(context.organization.id, id);
  if (!account) {
    return NextResponse.json({ error: "Social account not found." }, { status: 404 });
  }

  await prisma.socialAccount.update({
    where: { id },
    data: { status: "DISCONNECTED" },
  });

  logger.info("instagram.oauth.customer.disconnected", {
    socialAccountId: id,
    organizationId: context.organization.id,
  });
  return NextResponse.json({ ok: true });
}
