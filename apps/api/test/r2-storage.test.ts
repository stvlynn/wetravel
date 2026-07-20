import { describe, expect, it, vi } from "vitest";
import {
  R2Storage,
  type R2BucketLike,
} from "../src/infrastructure/storage/r2-storage";

describe("R2Storage", () => {
  it("reads and writes through the bound bucket with namespaced keys", async () => {
    const put = vi.fn<R2BucketLike["put"]>().mockResolvedValue({});
    const get = vi.fn<R2BucketLike["get"]>().mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      httpMetadata: { contentType: "image/png" },
    });
    const bucket: R2BucketLike = {
      put,
      get,
      delete: vi.fn<R2BucketLike["delete"]>().mockResolvedValue(undefined),
    };
    const storage = new R2Storage(
      {
        backend: "r2",
        root: "uploads",
        publicUrl: "https://api.example.test/api/uploads",
      },
      bucket,
    );

    await storage.write("avatars/user/avatar.png", {
      content: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    const stored = await storage.read("avatars/user/avatar.png");

    expect(put).toHaveBeenCalledWith(
      "uploads/avatars/user/avatar.png",
      new Uint8Array([1, 2, 3]),
      { httpMetadata: { contentType: "image/png" } },
    );
    expect(get).toHaveBeenCalledWith("uploads/avatars/user/avatar.png");
    expect(stored).toEqual({
      content: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    expect(storage.getPublicUrl("avatars/user/avatar.png")).toBe(
      "https://api.example.test/api/uploads/avatars/user/avatar.png",
    );
  });
});
