import path from "path";
import type { StorageService } from "./types";
import { LocalStorageAdapter } from "./local-storage-adapter";

export type { StorageService, StoredFileRef } from "./types";

let instance: StorageService | undefined;

/**
 * Returns the configured Storage Service. Driver is chosen by STORAGE_DRIVER;
 * "local" is the only driver in V1. Adding a production driver (S3-compatible,
 * NAS, etc.) means adding a case here — callers never change.
 */
export function getStorageService(): StorageService {
  if (instance) return instance;

  const driver = process.env.STORAGE_DRIVER ?? "local";

  switch (driver) {
    case "local": {
      const root = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? ".storage");
      instance = new LocalStorageAdapter(root);
      return instance;
    }
    default:
      throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  }
}
