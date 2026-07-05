import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { FileStorage, StoredFile } from "../../application/avatar";
import type { FileSystemStorageConfig } from "../config";
import { buildPublicUrl } from "./public-url";

export class FileSystemStorage implements FileStorage {
  private readonly root: string;

  constructor(private readonly config: FileSystemStorageConfig) {
    this.root = resolve(config.root);
  }

  async write(path: string, file: StoredFile): Promise<void> {
    const target = this.resolvePath(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }

  async read(path: string): Promise<StoredFile | null> {
    try {
      return {
        content: await readFile(this.resolvePath(path)),
        contentType: contentTypeForPath(path),
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(path: string): Promise<void> {
    await rm(this.resolvePath(path), { force: true });
  }

  getPublicUrl(path: string): string {
    return buildPublicUrl(this.config.publicUrl, path);
  }

  private resolvePath(path: string): string {
    const target = resolve(this.root, path);
    const fromRoot = relative(this.root, target);
    if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new Error("Storage path escapes the configured root");
    }
    return target;
  }
}

function contentTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

