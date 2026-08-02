import { NextResponse } from "next/server";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { DuplicateKeywordError, deleteKeyword, updateKeyword } from "@/lib/modules/keywords/keyword-service";

// Edit a keyword's value and/or toggle it active/inactive.
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/campaigns/[id]/keywords/[keywordId]">
) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: campaignId, keywordId } = await ctx.params;

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
  ctx: RouteContext<"/api/admin/campaigns/[id]/keywords/[keywordId]">
) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: campaignId, keywordId } = await ctx.params;

  const deleted = await deleteKeyword(campaignId, keywordId);
  if (!deleted) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
