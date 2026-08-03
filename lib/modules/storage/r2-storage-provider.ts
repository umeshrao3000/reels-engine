import type { StorageProvider, StoredFileRef } from "./types";

/**
 * Placeholder for the future Cloudflare R2 provider. Implements the
 * interface so it type-checks and can be selected via STORAGE_DRIVER=r2,
 * but every method throws — there is no cloud SDK dependency, no client,
 * and no network call anywhere in this class. Connecting it to a real R2
 * bucket is its own future milestone; see docs/STORAGE.md.
 */
export class R2StorageProvider implements StorageProvider {
  private notConnected(key: string): never {
    throw new Error(
      `R2 is not connected/configured (requested key "${key}"). ` +
        "R2StorageProvider is a placeholder for a future milestone — set " +
        "STORAGE_DRIVER=local (the default) until R2 is actually " +
        "implemented. See docs/STORAGE.md."
    );
  }

  async put(key: string, data: Buffer, contentType?: string): Promise<StoredFileRef> {
    void data;
    void contentType;
    return this.notConnected(key);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return this.notConnected(key);
  }

  async getDownloadUrl(key: string): Promise<string> {
    return this.notConnected(key);
  }

  async delete(key: string): Promise<void> {
    return this.notConnected(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.notConnected(key);
  }
}
