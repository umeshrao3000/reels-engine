import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { assertCampaignOwnership } from "@/lib/modules/organizations/ownership";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/api/admin/campaigns/[id] — identical validation/update shape,
// gated by organization ownership (via the campaign's SocialAccount)
// instead of ADMIN_PASSCODE.
export async function PATCH(request: Request, ctx: RouteContext<"/api/customer/campaigns/[id]">) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  const campaign = await assertCampaignOwnership(context.organization.id, id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // Note: triggerKeywords is intentionally not accepted here — it's a
  // derived cache maintained by lib/modules/keywords/keyword-service.ts.
  // Keyword edits go through /api/customer/campaigns/[id]/keywords instead.
  let body: {
    name?: string;
    instagramMediaId?: string;
    dmTemplate?: string;
    publicReplyTemplate?: string;
    isActive?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data: {
    name?: string;
    instagramMediaId?: string;
    dmTemplate?: string;
    publicReplyTemplate?: string;
    isActive?: boolean;
  } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "Name is required (max 200 characters)." }, { status: 400 });
    }
    data.name = name;
  }

  if (body.instagramMediaId !== undefined) {
    const instagramMediaId = body.instagramMediaId.trim();
    if (!instagramMediaId || instagramMediaId.length > 200) {
      return NextResponse.json(
        { error: "Reel ID is required (max 200 characters)." },
        { status: 400 }
      );
    }
    data.instagramMediaId = instagramMediaId;
  }

  if (body.dmTemplate !== undefined) {
    const dmTemplate = body.dmTemplate.trim();
    if (!dmTemplate || dmTemplate.length > 1000) {
      return NextResponse.json(
        { error: "DM template is required (max 1000 characters)." },
        { status: 400 }
      );
    }
    data.dmTemplate = dmTemplate;
  }

  if (body.publicReplyTemplate !== undefined) {
    const publicReplyTemplate = body.publicReplyTemplate.trim();
    if (!publicReplyTemplate || publicReplyTemplate.length > 1000) {
      return NextResponse.json(
        { error: "Public reply template is required (max 1000 characters)." },
        { status: 400 }
      );
    }
    data.publicReplyTemplate = publicReplyTemplate;
  }

  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.campaign.update({ where: { id }, data });
  return NextResponse.json({ ok: true, isActive: updated.isActive });
}

// Deleting a Campaign cascades to its ConversionLogs (schema:
// onDelete: Cascade) — this permanently removes that campaign's
// conversion history, not just the campaign config.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/customer/campaigns/[id]">) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  const campaign = await assertCampaignOwnership(context.organization.id, id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
