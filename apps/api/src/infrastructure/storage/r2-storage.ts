import type { FileStorage, StoredFile } from "../../application/storage";
import type { R2StorageConfig } from "../config";
import { buildPublicUrl } from "./public-url";

export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: {
    contentType?: string;
  };
}

export interface R2BucketLike {
  put(
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
}

export class R2Storage implements FileStorage {
  constructor(
    private readonly config: R2StorageConfig,
    private readonly bucket: R2BucketLike,
  ) {}

  async write(path: string, file: StoredFile): Promise<void> {
    await this.bucket.put(this.key(path), file.content, {
      httpMetadata: { contentType: file.contentType },
    });
  }

  async read(path: string): Promise<StoredFile | null> {
    const object = await this.bucket.get(this.key(path));
    if (!object) return null;
    return {
      content: new Uint8Array(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }

  async delete(path: string): Promise<void> {
    await this.bucket.delete(this.key(path));
  }

  getPublicUrl(path: string): string {
    return buildPublicUrl(this.config.publicUrl, path);
  }

  private key(path: string): string {
    return this.config.root ? `${this.config.root}/${path}` : path;
  }
}
