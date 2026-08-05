import { NextResponse } from "next/server";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { assertCampaignOwnership } from "@/lib/modules/organizations/ownership";
import { bulkAddKeywords } from "@/lib/modules/keywords/keyword-service";

const MAX_RAW_TEXT_LENGTH = 10_000;

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of app/api/admin/campaigns/[id]/keywords. Ownership-checked, then
// delegates to the same keyword-service used by admin — no matching-logic
// duplication, since that service is already campaign-scoped, not
// actor-scoped.
export async function POST(request: Request, ctx: RouteContext<"/api/customer/campaigns/[id]/keywords">) {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: campaignId } = await ctx.params;

  const campaign = await assertCampaignOwnership(context.organization.id, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  let body: { keywords?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = body.keywords ?? "";
  if (raw.length > MAX_RAW_TEXT_LENGTH) {
    return NextResponse.json({ error: "Too much text — split it into smaller batches." }, { status: 400 });
  }
  if (!raw.trim()) {
    return NextResponse.json({ error: "Provide at least one keyword." }, { status: 400 });
  }

  const result = await bulkAddKeywords(campaignId, raw);
  return NextResponse.json({ ok: true, ...result });
}
