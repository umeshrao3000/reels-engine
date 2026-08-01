import { getStorageService } from "@/lib/modules/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/storage/[...key]">) {
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
