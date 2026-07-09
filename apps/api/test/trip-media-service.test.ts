import { describe, expect, it } from "vitest";
import {
  TripMediaError,
  TripMediaService,
} from "../src/application/media";
import type { FileStorage, StoredFile } from "../src/application/storage";
import type { TripService } from "../src/application/use-cases";

class MemoryStorage implements FileStorage {
  readonly files = new Map<string, StoredFile>();

  async write(path: string, file: StoredFile): Promise<void> {
    this.files.set(path, file);
  }

  async read(path: string): Promise<StoredFile | null> {
    return this.files.get(path) ?? null;
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  getPublicUrl(path: string): string {
    return path
      ? `https://api.test/api/uploads/${path}`
      : "https://api.test/api/uploads";
  }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function tripsStub(assertEditable: TripService["assertEditable"]): TripService {
  return { assertEditable } as unknown as TripService;
}

describe("TripMediaService", () => {
  it("stores an image under the trip namespace and returns a public URL", async () => {
    const storage = new MemoryStorage();
    const service = new TripMediaService(
      storage,
      tripsStub(async () => undefined),
    );

    const url = await service.upload("trip-1", "user-1", {
      content: PNG,
      claimedMimeType: "image/png",
    });

    expect(url).toMatch(
      /^https:\/\/api\.test\/api\/uploads\/trips\/[0-9a-f]+\/.+\.png$/,
    );
    expect(storage.files.size).toBe(1);
  });

  it("rejects oversized images", async () => {
    const storage = new MemoryStorage();
    const service = new TripMediaService(
      storage,
      tripsStub(async () => undefined),
    );
    const content = new Uint8Array(2 * 1024 * 1024 + 1);
    content.set(PNG, 0);

    await expect(
      service.upload("trip-1", "user-1", {
        content,
        claimedMimeType: "image/png",
      }),
    ).rejects.toMatchObject({
      code: "media_too_large",
    } satisfies Partial<TripMediaError>);
  });

  it("rejects unsupported mime types", async () => {
    const storage = new MemoryStorage();
    const service = new TripMediaService(
      storage,
      tripsStub(async () => undefined),
    );

    await expect(
      service.upload("trip-1", "user-1", {
        content: new Uint8Array([0x00, 0x01]),
        claimedMimeType: "image/gif",
      }),
    ).rejects.toMatchObject({
      code: "media_unsupported_mime",
    } satisfies Partial<TripMediaError>);
  });

  it("propagates trip edit permission failures", async () => {
    const storage = new MemoryStorage();
    const service = new TripMediaService(
      storage,
      tripsStub(async () => {
        throw new Error("forbidden");
      }),
    );

    await expect(
      service.upload("trip-1", "user-1", {
        content: PNG,
        claimedMimeType: "image/png",
      }),
    ).rejects.toThrow("forbidden");
    expect(storage.files.size).toBe(0);
  });
});
