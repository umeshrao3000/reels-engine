import path from "path";
import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-storage-provider";
import { R2StorageProvider } from "./r2-storage-provider";

export type { StorageProvider, StoredFileRef } from "./types";

let instance: StorageProvider | undefined;

/**
 * Returns the configured Storage Provider. Driver is chosen by STORAGE_DRIVER
 * ("local" by default). Adding a new provider means adding one case here —
 * callers never change. "r2" selects a placeholder that fails clearly on
 * every call — R2 is not implemented or connected yet, see docs/STORAGE.md.
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
      instance = new R2StorageProvider();
      return instance;
    }
    default:
      throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  }
}
