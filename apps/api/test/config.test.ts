import { describe, expect, it } from "vitest";
import { loadConfig, type RawEnv } from "../src/infrastructure/config";

const BASE_ENV: RawEnv = {
  DATABASE_URL: "postgres://example.test/wetravel",
  BETTER_AUTH_SECRET: "a-secure-test-secret-with-32-characters",
  BASE_URL: "https://api.example.test",
};

describe("loadConfig storage", () => {
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
      S3_BUCKET: "wetravel",
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
      bucket: "wetravel",
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
        S3_BUCKET: "wetravel",
        S3_REGION: "auto",
        S3_ENDPOINT: "https://example.test",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_FORCE_PATH_STYLE: "yes",
      }),
    ).toThrow('S3_FORCE_PATH_STYLE must be either "true" or "false"');
  });
});

