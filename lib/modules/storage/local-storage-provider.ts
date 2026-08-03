import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { StorageProvider, StoredFileRef } from "./types";

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly root: string) {}

  private resolvePath(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    return path.join(this.root, normalized);
  }

  async put(key: string, data: Buffer): Promise<StoredFileRef> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { key, sizeBytes: data.byteLength };
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  async getDownloadUrl(key: string): Promise<string> {
    // Served through our own API route since local disk isn't public.
    // A cloud provider would return a signed URL here instead.
    return `/api/storage/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }
}
