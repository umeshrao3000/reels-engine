import path from "path";
import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-storage-provider";
import { R2StorageProvider } from "./r2-storage-provider";

export type { StorageProvider, StoredFileRef } from "./types";

let instance: StorageProvider | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var "${name}" for STORAGE_DRIVER=r2`);
  }
  return value;
}

/**
 * Returns the configured Storage Provider. Driver is chosen by STORAGE_DRIVER
 * ("local" by default). Adding a new provider means adding one case here —
 * callers never change. "r2" is wired up but not yet in production use: no
 * bucket, credentials, or API keys exist for it — see docs/STORAGE.md.
 */
export function getStorageProvider(): StorageProvider {
  if (instance) return instance;

  const driver = process.env.STORAGE_DRIVER ?? "local";

  switch (driver) {
    case "local": {
      const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_ROOT ?? ".storage");
      instance = new LocalStorageProvider(root);
      return instance;
    }
    case "r2": {
      instance = new R2StorageProvider({
        accountId: requireEnv("R2_ACCOUNT_ID"),
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
        bucket: requireEnv("R2_BUCKET_NAME"),
      });
      return instance;
    }
    default:
      throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  }
}
