import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { FileStorage, StoredFile } from "../../application/storage";
import type { S3StorageConfig } from "../config";
import { buildPublicUrl } from "./public-url";

export class S3Storage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async write(path: string, file: StoredFile): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(path),
        Body: file.content,
        ContentType: file.contentType,
      }),
    );
  }

  async read(path: string): Promise<StoredFile | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(path) }),
      );
      if (!result.Body) throw new Error("S3 returned an object without a body");
      return {
        content: await result.Body.transformToByteArray(),
        contentType: result.ContentType ?? "application/octet-stream",
      };
    } catch (error) {
      if (error instanceof NoSuchKey || isNotFoundMetadata(error)) return null;
      throw error;
    }
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(path) }),
    );
  }

  getPublicUrl(path: string): string {
    return buildPublicUrl(this.config.publicUrl, path);
  }

  private key(path: string): string {
    return this.config.root ? `${this.config.root}/${path}` : path;
  }
}

function isNotFoundMetadata(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("$metadata" in error)) return false;
  const metadata = error.$metadata;
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "httpStatusCode" in metadata &&
      metadata.httpStatusCode === 404,
  );
}

