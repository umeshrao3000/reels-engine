import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, StoredFileRef } from "./types";

export type R2StorageProviderConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** How long a signed download URL stays valid. Defaults to 5 minutes. */
  downloadUrlExpirySeconds?: number;
};

/**
 * Cloudflare R2 provider, speaking R2's S3-compatible API via the AWS SDK.
 *
 * Not wired up as the active provider anywhere yet — no bucket, credentials,
 * or API keys exist for it in this milestone. It exists so that turning it on
 * later (V1 Hardening Sprint, Priority 1 final step) is a configuration change
 * (STORAGE_DRIVER=r2 + four env vars in `getStorageProvider`), not a code change.
 * `client` is accepted for test injection only — real callers never pass it.
 */
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly downloadUrlExpirySeconds: number;

  constructor(config: R2StorageProviderConfig, client?: S3Client) {
    this.bucket = config.bucket;
    this.downloadUrlExpirySeconds = config.downloadUrlExpirySeconds ?? 300;
    this.client =
      client ??
      new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async put(key: string, data: Buffer, contentType?: string): Promise<StoredFileRef> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    return { key, sizeBytes: data.byteLength };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    if (!result.Body) {
      throw new Error(`R2 object "${key}" returned no body`);
    }
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getDownloadUrl(key: string): Promise<string> {
    // The bucket is private; issue a short-lived signed URL rather than
    // exposing the bucket name or a public endpoint.
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.downloadUrlExpirySeconds,
    });
  }

  async delete(key: string): Promise<void> {
    // DeleteObject is idempotent on S3-compatible APIs — no error for a
    // missing key, matching LocalStorageProvider's no-op-if-absent behavior.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? (error as { name?: unknown }).name : undefined;
  if (name === "NotFound" || name === "NoSuchKey") return true;
  const metadata =
    "$metadata" in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata : undefined;
  return metadata?.httpStatusCode === 404;
}
