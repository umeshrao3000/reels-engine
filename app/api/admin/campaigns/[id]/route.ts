import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

function normalizeKeywords(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const keyword = part.trim().toLowerCase();
    if (keyword) seen.add(keyword);
  }
  return [...seen];
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  let body: {
    name?: string;
    instagramMediaId?: string;
    triggerKeywords?: string;
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
    triggerKeywords?: string[];
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

  if (body.triggerKeywords !== undefined) {
    const triggerKeywords = normalizeKeywords(body.triggerKeywords);
    if (triggerKeywords.length === 0) {
      return NextResponse.json({ error: "At least one trigger keyword is required." }, { status: 400 });
    }
    data.triggerKeywords = triggerKeywords;
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
// conversion history, not just the campaign config. The confirm prompt
// in DeleteCampaignButton.tsx says so explicitly.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    await prisma.campaign.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
