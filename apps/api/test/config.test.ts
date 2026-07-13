import { describe, expect, it } from "vitest";
import { loadConfig, type RawEnv } from "../src/infrastructure/config";

const BASE_ENV: RawEnv = {
  DATABASE_URL: "postgres://example.test/opentrip",
  BETTER_AUTH_SECRET: "a-secure-test-secret-with-32-characters",
  BASE_URL: "https://api.example.test",
};

describe("loadConfig database provider", () => {
  it("defaults to postgres and accepts mysql from URL or env", () => {
    const pg = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
    });
    expect(pg.databaseProvider).toBe("postgres");
    expect(pg.databaseSsl).toBe("off");

    const fromUrl = loadConfig({
      ...BASE_ENV,
      DATABASE_URL: "mysql://u:p@localhost:3306/opentrip",
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
    });
    expect(fromUrl.databaseProvider).toBe("mysql");
    expect(fromUrl.databaseSsl).toBe("off");

    const explicit = loadConfig({
      ...BASE_ENV,
      DATABASE_PROVIDER: "mysql",
      DATABASE_SSL: "required",
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
    });
    expect(explicit.databaseProvider).toBe("mysql");
    expect(explicit.databaseSsl).toBe("required");
  });
});

describe("loadConfig storage", () => {
  it("trusts the native callback origin by default", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data/uploads",
    });

    expect(config.trustedOrigins).toEqual([
      "https://api.example.test",
      "opentrip://",
    ]);
  });

  it("requires an explicit storage backend", () => {
    expect(() => loadConfig(BASE_ENV)).toThrow("STORAGE_BACKEND is required");
  });

  it("loads filesystem storage from env", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data/uploads",
    });

    expect(config.storage).toEqual({
      backend: "fs",
      root: "/data/uploads",
      publicUrl: "https://api.example.test/api/uploads",
    });
  });

  it("loads S3-compatible storage from env", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "s3",
      STORAGE_ROOT: "/avatars/",
      STORAGE_PUBLIC_URL: "https://cdn.example.test/files/",
      S3_BUCKET: "opentrip",
      S3_REGION: "auto",
      S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
      S3_FORCE_PATH_STYLE: "true",
    });

    expect(config.storage).toMatchObject({
      backend: "s3",
      root: "avatars",
      publicUrl: "https://cdn.example.test/files/",
      bucket: "opentrip",
      region: "auto",
      forcePathStyle: true,
    });
  });

  it("rejects unknown backends and invalid booleans", () => {
    expect(() => loadConfig({ ...BASE_ENV, STORAGE_BACKEND: "r2" })).toThrow(
      'STORAGE_BACKEND must be either "fs" or "s3"',
    );
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        STORAGE_BACKEND: "s3",
        S3_BUCKET: "opentrip",
        S3_REGION: "auto",
        S3_ENDPOINT: "https://example.test",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_FORCE_PATH_STYLE: "yes",
      }),
    ).toThrow('S3_FORCE_PATH_STYLE must be either "true" or "false"');
  });
});

describe("loadConfig email", () => {
  it("defaults to console provider", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
    });
    expect(config.email).toEqual({
      provider: "console",
      from: "OpenTrip <noreply@localhost>",
      resendApiKey: undefined,
    });
  });

  it("loads resend when key and from are set", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "OpenTrip <noreply@example.test>",
      RESEND_API_KEY: "re_test",
    });
    expect(config.email).toEqual({
      provider: "resend",
      from: "OpenTrip <noreply@example.test>",
      resendApiKey: "re_test",
    });
  });

  it("rejects resend without API key or from", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        STORAGE_BACKEND: "fs",
        STORAGE_ROOT: "/data",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "OpenTrip <noreply@example.test>",
      }),
    ).toThrow("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");

    expect(() =>
      loadConfig({
        ...BASE_ENV,
        STORAGE_BACKEND: "fs",
        STORAGE_ROOT: "/data",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test",
      }),
    ).toThrow("EMAIL_FROM is required when EMAIL_PROVIDER=resend");
  });
});

describe("loadConfig captcha", () => {
  it("supports Cloudflare Turnstile with a server secret", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
      CAPTCHA_PROVIDER: "cloudflare-turnstile",
      CAPTCHA_SECRET_KEY: "turnstile-secret",
    });

    expect(config.captcha).toEqual({
      provider: "cloudflare-turnstile",
      secretKey: "turnstile-secret",
    });
  });

  it("rejects captcha providers without a browser implementation", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        STORAGE_BACKEND: "fs",
        STORAGE_ROOT: "/data",
        CAPTCHA_PROVIDER: "hcaptcha",
        CAPTCHA_SECRET_KEY: "secret",
      }),
    ).toThrow("CAPTCHA_PROVIDER must be one of cloudflare-turnstile");
  });
});

describe("loadConfig street view", () => {
  it("keeps street view disabled unless a provider is selected", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
    });
    expect(config.streetView).toBeNull();
  });

  it("requires a Mapillary token", () => {
    const config = loadConfig({
      ...BASE_ENV,
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
      STREET_VIEW_PROVIDER: "mapillary",
      MAPILLARY_ACCESS_TOKEN: "test-token",
      AI_MODEL: "vision-model",
      AI_API_KEY: "ai-key",
    });
    expect(config.streetView).toEqual({
      provider: "mapillary",
      mapillaryAccessToken: "test-token",
      timeoutMs: 12_000,
    });
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        STORAGE_BACKEND: "fs",
        STORAGE_ROOT: "/data",
        STREET_VIEW_PROVIDER: "mapillary",
      }),
    ).toThrow("MAPILLARY_ACCESS_TOKEN is required");
  });
});
