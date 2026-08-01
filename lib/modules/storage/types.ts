export type StoredFileRef = {
  key: string;
  sizeBytes: number;
};

/**
 * Storage Service abstraction. All file I/O in the app goes through this
 * interface — nothing else may touch the filesystem or a cloud SDK directly.
 * V1 ships only LocalStorageAdapter; swapping in S3-compatible/NAS storage
 * later means adding one adapter here, not touching callers.
 */
export interface StorageService {
  put(key: string, data: Buffer, contentType?: string): Promise<StoredFileRef>;
  getBuffer(key: string): Promise<Buffer>;
  getDownloadUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
