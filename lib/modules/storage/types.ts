export type StoredFileRef = {
  key: string;
  sizeBytes: number;
};

/**
 * Storage Provider abstraction. All file I/O in the app goes through this
 * interface — nothing else may touch the filesystem or a cloud SDK directly.
 * Concrete providers (LocalStorageProvider, R2StorageProvider, ...) implement
 * this once; callers never change when the active provider changes.
 */
export interface StorageProvider {
  put(key: string, data: Buffer, contentType?: string): Promise<StoredFileRef>;
  getBuffer(key: string): Promise<Buffer>;
  getDownloadUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
