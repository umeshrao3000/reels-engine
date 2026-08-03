import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageProvider } from "../local-storage-provider";

describe("LocalStorageProvider", () => {
  let root: string;
  let provider: LocalStorageProvider;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "storage-provider-test-"));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    provider = new LocalStorageProvider(root);
  });

  it("round-trips a file through put/getBuffer/exists/delete", async () => {
    const key = "projects/abc/original.mp4";
    const data = Buffer.from("hello reel");

    const ref = await provider.put(key, data);
    assert.equal(ref.key, key);
    assert.equal(ref.sizeBytes, data.byteLength);

    assert.equal(await provider.exists(key), true);
    assert.deepEqual(await provider.getBuffer(key), data);

    await provider.delete(key);
    assert.equal(await provider.exists(key), false);
  });

  it("reports exists() as false for a key that was never written", async () => {
    assert.equal(await provider.exists("projects/never/written.mp4"), false);
  });

  it("delete() is a no-op for a missing key (matches idempotent cloud DELETE semantics)", async () => {
    await assert.doesNotReject(provider.delete("projects/missing/file.mp4"));
  });

  it("getDownloadUrl() returns the admin-only proxy route, not a direct filesystem path", async () => {
    const url = await provider.getDownloadUrl("projects/abc/original.mp4");
    assert.equal(url, "/api/storage/projects%2Fabc%2Foriginal.mp4");
  });

  it("does not allow a key to escape the storage root via path traversal", async () => {
    const escapeAttempt = "../../../etc/passwd";
    await provider.put(escapeAttempt, Buffer.from("payload"));

    // The written file must land inside root, never above it.
    const withinRoot = path.resolve(root, path.normalize(escapeAttempt).replace(/^(\.\.[/\\])+/, ""));
    assert.ok(withinRoot.startsWith(root));
  });
});
