import type { FileStorage } from "../../application/storage";
import type { StorageConfig } from "../config";
import { S3Storage } from "./s3-storage";

export function createWorkerStorage(config: StorageConfig): FileStorage {
  if (config.backend !== "s3") {
    throw new Error('Cloudflare Workers require STORAGE_BACKEND="s3"');
  }
  return new S3Storage(config);
}

