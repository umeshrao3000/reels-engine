import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { bulkAddKeywords } from "@/lib/modules/keywords/keyword-service";

const MAX_RAW_TEXT_LENGTH = 10_000;

// Bulk add keywords to a campaign (comma or newline separated). Existing
// values are skipped, not errored — this endpoint is also what the
// Keyword Management UI's "add" box calls for a single keyword.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/campaigns/[id]/keywords">) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: campaignId } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
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
