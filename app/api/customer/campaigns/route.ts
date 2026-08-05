import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { assertSocialAccountOwnership } from "@/lib/modules/organizations/ownership";
import { normalizeKeywordList } from "@/lib/modules/keywords/normalize";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/api/admin/campaigns — same validation and creation shape, scoped
// to the caller's own organization. GET is new (admin has no equivalent
// list endpoint; its campaigns page queries Prisma directly since it's a
// server component with no per-caller scope to enforce).
export async function GET() {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const campaigns = await prisma.campaign.findMany({
    where: { socialAccount: { organizationId: context.organization.id } },
    orderBy: { createdAt: "desc" },
    include: { socialAccount: { select: { instagramUsername: true, instagramBusinessId: true } } },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    name?: string;
    socialAccountId?: string;
    instagramMediaId?: string;
    initialKeywords?: string;
    dmTemplate?: string;
    publicReplyTemplate?: string;
    isActive?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Name is required (max 200 characters)." }, { status: 400 });
  }

  const socialAccountId = body.socialAccountId?.trim();
  if (!socialAccountId) {
    return NextResponse.json({ error: "A connected Instagram account is required." }, { status: 400 });
  }

  const instagramMediaId = body.instagramMediaId?.trim();
  if (!instagramMediaId || instagramMediaId.length > 200) {
    return NextResponse.json(
      { error: "Reel ID is required (max 200 characters)." },
      { status: 400 }
    );
  }

  const { values: triggerKeywords, rejectedTooLong } = normalizeKeywordList(body.initialKeywords ?? "");
  if (triggerKeywords.length === 0) {
    return NextResponse.json(
      {
        error:
          rejectedTooLong.length > 0
            ? "At least one trigger keyword is required (100 characters max each)."
            : "At least one trigger keyword is required.",
      },
      { status: 400 }
    );
  }

  const dmTemplate = body.dmTemplate?.trim();
  if (!dmTemplate || dmTemplate.length > 1000) {
    return NextResponse.json(
      { error: "DM template is required (max 1000 characters)." },
      { status: 400 }
    );
  }

  const publicReplyTemplate = body.publicReplyTemplate?.trim();
  if (!publicReplyTemplate || publicReplyTemplate.length > 1000) {
    return NextResponse.json(
      { error: "Public reply template is required (max 1000 characters)." },
      { status: 400 }
    );
  }

  // Ownership check, not a plain existence check — this is the boundary
  // that stops a customer from pointing a new campaign at another
  // organization's (or a legacy admin) Instagram account.
  const socialAccount = await assertSocialAccountOwnership(context.organization.id, socialAccountId);
  if (!socialAccount) {
    return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      socialAccountId,
      instagramMediaId,
      triggerKeywords,
      dmTemplate,
      publicReplyTemplate,
      isActive: body.isActive ?? true,
      keywords: { create: triggerKeywords.map((value) => ({ value })) },
    },
  });

  return NextResponse.json({ ok: true, id: campaign.id });
}
