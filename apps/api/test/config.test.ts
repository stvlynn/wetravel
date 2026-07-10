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
    // MySQL defaults to TLS required for managed clouds / Workers direct connect.
    expect(fromUrl.databaseSsl).toBe("required");

    const explicit = loadConfig({
      ...BASE_ENV,
      DATABASE_PROVIDER: "mysql",
      DATABASE_SSL: "off",
      STORAGE_BACKEND: "fs",
      STORAGE_ROOT: "/data",
    });
    expect(explicit.databaseProvider).toBe("mysql");
    expect(explicit.databaseSsl).toBe("off");
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
