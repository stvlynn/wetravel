import { describe, expect, it } from "vitest";
import { AvatarService, MAX_AVATAR_BYTES } from "../src/application/avatar";
import type {
  AvatarError,
  CurrentUserProfile,
  FileStorage,
  StoredFile,
} from "../src/application/avatar";

class MemoryStorage implements FileStorage {
  readonly files = new Map<string, StoredFile>();
  readonly deleted: string[] = [];
  failDeleteFor: string | null = null;

  async write(path: string, file: StoredFile): Promise<void> {
    this.files.set(path, file);
  }

  async read(path: string): Promise<StoredFile | null> {
    return this.files.get(path) ?? null;
  }

  async delete(path: string): Promise<void> {
    if (path === this.failDeleteFor) throw new Error("delete failed");
    this.deleted.push(path);
    this.files.delete(path);
  }

  getPublicUrl(path: string): string {
    return path ? `https://api.test/api/uploads/${path}` : "https://api.test/api/uploads";
  }
}

class Profile implements CurrentUserProfile {
  readonly images: Array<string | null> = [];
  failNext = false;

  async updateImage(image: string | null): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("profile failed");
    }
    this.images.push(image);
  }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("AvatarService", () => {
  it("stores an image and updates the current profile", async () => {
    const storage = new MemoryStorage();
    const profile = new Profile();
    const service = new AvatarService(storage);

    const url = await service.replace(
      "user-1",
      "https://external.test/avatar.png",
      { content: PNG, claimedMimeType: "image/png" },
      profile,
    );

    expect(url).toMatch(/^https:\/\/api\.test\/api\/uploads\/avatars\/757365722d31\/.+\.png$/);
    expect(profile.images).toEqual([url]);
    expect(storage.files).toHaveLength(1);
    expect(storage.deleted).toEqual([]);
  });

  it("deletes the previous managed avatar after replacement", async () => {
    const storage = new MemoryStorage();
    const profile = new Profile();
    const service = new AvatarService(storage);
    const oldPath = "avatars/757365722d31/00000000-0000-4000-8000-000000000000.png";
    storage.files.set(oldPath, { content: PNG, contentType: "image/png" });

    await service.replace(
      "user-1",
      storage.getPublicUrl(oldPath),
      { content: PNG, claimedMimeType: "image/png" },
      profile,
    );

    expect(storage.deleted).toContain(oldPath);
    expect(storage.files.has(oldPath)).toBe(false);
  });

  it("deletes a new file when the profile update fails", async () => {
    const storage = new MemoryStorage();
    const profile = new Profile();
    profile.failNext = true;
    const service = new AvatarService(storage);

    await expect(
      service.replace(
        "user-1",
        null,
        { content: PNG, claimedMimeType: "image/png" },
        profile,
      ),
    ).rejects.toMatchObject({ code: "avatar_profile_update_failed" } satisfies Partial<AvatarError>);
    expect(profile.images).toEqual([null]);
    expect(storage.files).toHaveLength(0);
    expect(storage.deleted).toHaveLength(1);
  });

  it("restores the old profile and removes the new file when old cleanup fails", async () => {
    const storage = new MemoryStorage();
    const profile = new Profile();
    const service = new AvatarService(storage);
    const oldPath = "avatars/757365722d31/00000000-0000-4000-8000-000000000000.png";
    const oldUrl = storage.getPublicUrl(oldPath);
    storage.failDeleteFor = oldPath;

    await expect(
      service.replace(
        "user-1",
        oldUrl,
        { content: PNG, claimedMimeType: "image/png" },
        profile,
      ),
    ).rejects.toMatchObject({ code: "avatar_cleanup_failed" } satisfies Partial<AvatarError>);
    expect(profile.images.at(-1)).toBe(oldUrl);
    expect(storage.files).toHaveLength(0);
  });

  it("clears the profile and deletes its managed avatar", async () => {
    const storage = new MemoryStorage();
    const profile = new Profile();
    const service = new AvatarService(storage);
    const path = "avatars/757365722d31/00000000-0000-4000-8000-000000000000.png";

    await service.remove(storage.getPublicUrl(path), profile);

    expect(profile.images).toEqual([null]);
    expect(storage.deleted).toEqual([path]);
  });

  it("rejects oversized and spoofed files", async () => {
    const service = new AvatarService(new MemoryStorage());
    const profile = new Profile();

    await expect(
      service.replace(
        "user-1",
        null,
        { content: new Uint8Array(MAX_AVATAR_BYTES + 1), claimedMimeType: "image/png" },
        profile,
      ),
    ).rejects.toMatchObject({ code: "avatar_too_large" } satisfies Partial<AvatarError>);
    await expect(
      service.replace(
        "user-1",
        null,
        { content: new TextEncoder().encode("not an image"), claimedMimeType: "image/png" },
        profile,
      ),
    ).rejects.toMatchObject({ code: "avatar_unsupported_mime" } satisfies Partial<AvatarError>);
  });
});
