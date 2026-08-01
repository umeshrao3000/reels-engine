import { getStorageService } from "@/lib/modules/storage";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";

// Admin-only file browser (e.g. previewing an upload from the ops panel).
// Customer-facing downloads go through /api/deliver/[token]/[uploadId]
// instead, which is scoped to a single project via its shareToken.
export async function GET(_req: Request, ctx: RouteContext<"/api/storage/[...key]">) {
  if (!(await isRequestFromAdmin())) {
    return new Response("Not authenticated", { status: 401 });
  }

  const { key } = await ctx.params;
  const storageKey = key.map(decodeURIComponent).join("/");

  const storage = getStorageService();
  if (!(await storage.exists(storageKey))) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await storage.getBuffer(storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
