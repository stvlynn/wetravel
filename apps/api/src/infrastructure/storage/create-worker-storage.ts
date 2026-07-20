import type { FileStorage } from "../../application/storage";
import type { StorageConfig } from "../config";
import { R2Storage, type R2BucketLike } from "./r2-storage";
import { S3Storage } from "./s3-storage";

export function createWorkerStorage(
  config: StorageConfig,
  r2Bucket?: R2BucketLike,
): FileStorage {
  if (config.backend === "r2") {
    if (!r2Bucket) {
      throw new Error("R2_FILE_STORAGE binding is required");
    }
    return new R2Storage(config, r2Bucket);
  }
  if (config.backend === "s3") return new S3Storage(config);
  throw new Error('Cloudflare Workers require STORAGE_BACKEND="r2" or "s3"');
}

