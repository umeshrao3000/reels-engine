import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { R2StorageProvider } from "../r2-storage-provider";

// R2StorageProvider is a placeholder for a future milestone: no cloud SDK,
// no client, no network call. Every method must fail clearly and safely
// rather than silently doing nothing or pretending to succeed.
describe("R2StorageProvider (placeholder, not connected)", () => {
  it("put() throws a clear not-connected error", async () => {
    const provider = new R2StorageProvider();
    await assert.rejects(
      provider.put("projects/abc/original.mp4", Buffer.from("hello reel")),
      /R2 is not connected\/configured/
    );
  });

  it("getBuffer() throws a clear not-connected error", async () => {
    const provider = new R2StorageProvider();
    await assert.rejects(provider.getBuffer("projects/abc/original.mp4"), /R2 is not connected\/configured/);
  });

  it("getDownloadUrl() throws a clear not-connected error", async () => {
    const provider = new R2StorageProvider();
    await assert.rejects(provider.getDownloadUrl("projects/abc/original.mp4"), /R2 is not connected\/configured/);
  });

  it("delete() throws a clear not-connected error", async () => {
    const provider = new R2StorageProvider();
    await assert.rejects(provider.delete("projects/abc/original.mp4"), /R2 is not connected\/configured/);
  });

  it("exists() throws a clear not-connected error", async () => {
    const provider = new R2StorageProvider();
    await assert.rejects(provider.exists("projects/abc/original.mp4"), /R2 is not connected\/configured/);
  });
});
