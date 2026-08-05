import { NextResponse } from "next/server";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { assertCampaignOwnership } from "@/lib/modules/organizations/ownership";
import { DuplicateKeywordError, deleteKeyword, updateKeyword } from "@/lib/modules/keywords/keyword-service";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/api/admin/campaigns/[id]/keywords/[keywordId].
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/customer/campaigns/[id]/keywords/[keywordId]">
) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: campaignId, keywordId } = await ctx.params;

  const campaign = await assertCampaignOwnership(context.organization.id, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  let body: { value?: string; isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.value !== undefined && body.value.trim().length > 100) {
    return NextResponse.json({ error: "Keyword is too long (max 100 characters)." }, { status: 400 });
  }

  try {
    const updated = await updateKeyword(campaignId, keywordId, {
      value: body.value,
      isActive: body.isActive,
    });
    if (!updated) {
      return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, keyword: updated });
  } catch (err) {
    if (err instanceof DuplicateKeywordError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error && err.message === "Keyword value cannot be empty.") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/customer/campaigns/[id]/keywords/[keywordId]">
) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: campaignId, keywordId } = await ctx.params;

  const campaign = await assertCampaignOwnership(context.organization.id, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const deleted = await deleteKeyword(campaignId, keywordId);
  if (!deleted) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
