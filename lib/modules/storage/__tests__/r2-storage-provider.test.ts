import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { S3Client } from "@aws-sdk/client-s3";
import { R2StorageProvider } from "../r2-storage-provider";

// R2StorageProvider is not connected to a real bucket in this milestone —
// these tests exercise its logic against a fake S3-compatible client only.
// No network call is ever made here.
class FakeS3Client {
  private readonly objects = new Map<string, { body: Buffer; contentType?: string }>();

  async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
    switch (command.constructor.name) {
      case "PutObjectCommand": {
        const { Key, Body, ContentType } = command.input as {
          Key: string;
          Body: Buffer;
          ContentType?: string;
        };
        this.objects.set(Key, { body: Buffer.from(Body), contentType: ContentType });
        return {};
      }
      case "GetObjectCommand": {
        const { Key } = command.input as { Key: string };
        const object = this.objects.get(Key);
        if (!object) throw notFoundError();
        return { Body: { transformToByteArray: async () => new Uint8Array(object.body) } };
      }
      case "HeadObjectCommand": {
        const { Key } = command.input as { Key: string };
        if (!this.objects.has(Key)) throw notFoundError();
        return {};
      }
      case "DeleteObjectCommand": {
        const { Key } = command.input as { Key: string };
        this.objects.delete(Key);
        return {};
      }
      default:
        throw new Error(`FakeS3Client: unhandled command ${command.constructor.name}`);
    }
  }
}

function notFoundError(): Error {
  const error = new Error("NotFound") as Error & {
    name: string;
    $metadata: { httpStatusCode: number };
  };
  error.name = "NotFound";
  error.$metadata = { httpStatusCode: 404 };
  return error;
}

const testConfig = {
  accountId: "test-account",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "test-bucket",
};

describe("R2StorageProvider (logic only, no network calls)", () => {
  it("round-trips a file through put/getBuffer/exists/delete", async () => {
    const provider = new R2StorageProvider(testConfig, new FakeS3Client() as unknown as S3Client);
    const key = "projects/abc/original.mp4";
    const data = Buffer.from("hello reel");

    const ref = await provider.put(key, data, "video/mp4");
    assert.equal(ref.key, key);
    assert.equal(ref.sizeBytes, data.byteLength);

    assert.equal(await provider.exists(key), true);
    assert.deepEqual(await provider.getBuffer(key), data);

    await provider.delete(key);
    assert.equal(await provider.exists(key), false);
  });

  it("exists() translates a 404/NotFound into false rather than throwing", async () => {
    const provider = new R2StorageProvider(testConfig, new FakeS3Client() as unknown as S3Client);
    assert.equal(await provider.exists("projects/never/written.mp4"), false);
  });

  it("getBuffer() rejects for a missing key instead of returning empty data", async () => {
    const provider = new R2StorageProvider(testConfig, new FakeS3Client() as unknown as S3Client);
    await assert.rejects(provider.getBuffer("projects/missing/file.mp4"));
  });

  it("getDownloadUrl() signs a time-limited URL scoped to the bucket, without exposing credentials", async () => {
    // No injected client here: getSignedUrl() is a pure local signing
    // computation (no HTTP request), so this is safe to exercise with
    // placeholder credentials and never touches the network.
    const provider = new R2StorageProvider(testConfig);
    const url = await provider.getDownloadUrl("projects/abc/processed.mp4");

    const parsed = new URL(url);
    assert.equal(parsed.hostname, "test-bucket.test-account.r2.cloudflarestorage.com");
    assert.equal(parsed.pathname, "/projects/abc/processed.mp4");
    assert.ok(parsed.searchParams.has("X-Amz-Signature"));
    assert.equal(parsed.searchParams.get("X-Amz-Expires"), "300");
    assert.ok(!url.includes(testConfig.secretAccessKey));
  });
});
