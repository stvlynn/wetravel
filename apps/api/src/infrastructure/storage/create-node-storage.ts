import type { FileStorage } from "../../application/avatar";
import type { StorageConfig } from "../config";
import { FileSystemStorage } from "./file-system-storage";
import { S3Storage } from "./s3-storage";

export function createNodeStorage(config: StorageConfig): FileStorage {
  return config.backend === "fs" ? new FileSystemStorage(config) : new S3Storage(config);
}

