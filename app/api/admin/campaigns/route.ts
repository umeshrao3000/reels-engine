import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

// Splits a comma-separated keyword string into a normalized, deduped,
// lowercase array — the single place triggerKeywords normalization
// happens, so trigger-matcher.ts's "stored lowercase" assumption
// (Milestone 3) always holds regardless of what the admin typed.
function normalizeKeywords(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const keyword = part.trim().toLowerCase();
    if (keyword) seen.add(keyword);
  }
  return [...seen];
}

export async function POST(request: Request) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    name?: string;
    socialAccountId?: string;
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

  const triggerKeywords = normalizeKeywords(body.triggerKeywords ?? "");
  if (triggerKeywords.length === 0) {
    return NextResponse.json({ error: "At least one trigger keyword is required." }, { status: 400 });
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

  const socialAccount = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
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
    },
  });

  return NextResponse.json({ ok: true, id: campaign.id });
}
