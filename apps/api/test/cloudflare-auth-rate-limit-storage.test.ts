import { describe, expect, it, vi } from "vitest";
import { createCloudflareAuthRateLimitStorage } from "../src/infrastructure/auth";

describe("Cloudflare Better Auth rate-limit storage", () => {
  it("routes an atomic consume to a hashed Durable Object name", async () => {
    const fetch = vi.fn(async (request: Request) => {
      await expect(request.json()).resolves.toEqual({ window: 60, max: 3 });
      return Response.json({ allowed: true, retryAfter: null });
    });
    const getByName = vi.fn<(name: string) => { fetch: typeof fetch }>(() => ({
      fetch,
    }));
    const storage = createCloudflareAuthRateLimitStorage({ getByName });

    await expect(
      storage.consume("198.51.100.2:/email-otp/send-verification-otp", {
        window: 60,
        max: 3,
      }),
    ).resolves.toEqual({ allowed: true, retryAfter: null });

    const objectName = getByName.mock.calls[0]![0];
    expect(objectName).toMatch(/^[a-f0-9]{64}$/);
    expect(objectName).not.toContain("198.51.100.2");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fails closed instead of using the legacy non-atomic operations", async () => {
    const storage = createCloudflareAuthRateLimitStorage({
      getByName: () => ({ fetch: vi.fn() }),
    });

    await expect(storage.get("key")).rejects.toThrow("atomic consume");
    await expect(
      storage.set("key", { key: "key", count: 1, lastRequest: Date.now() }),
    ).rejects.toThrow("atomic consume");
  });

  it("fails closed when the Durable Object rejects the request", async () => {
    const storage = createCloudflareAuthRateLimitStorage({
      getByName: () => ({
        fetch: vi.fn(async () => new Response(null, { status: 503 })),
      }),
    });

    await expect(storage.consume("key", { window: 10, max: 3 })).rejects.toThrow(
      "returned 503",
    );
  });
});
