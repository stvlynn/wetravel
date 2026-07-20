import type { FileStorage } from "../../application/storage";
import type { StorageConfig } from "../config";
import { FileSystemStorage } from "./file-system-storage";
import { S3Storage } from "./s3-storage";

export function createNodeStorage(config: StorageConfig): FileStorage {
  if (config.backend === "fs") return new FileSystemStorage(config);
  if (config.backend === "s3") return new S3Storage(config);
  throw new Error('Node requires STORAGE_BACKEND="fs" or "s3"');
}

