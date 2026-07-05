export interface AppConfig {
  databaseUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  trustedOrigins: string[];
  storage: StorageConfig;
}

interface StorageConfigBase {
  publicUrl: string;
}

export interface FileSystemStorageConfig extends StorageConfigBase {
  backend: "fs";
  root: string;
}

export interface S3StorageConfig extends StorageConfigBase {
  backend: "s3";
  root: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export type StorageConfig = FileSystemStorageConfig | S3StorageConfig;

export interface RawEnv {
  BASE_URL?: string;
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  TRUSTED_ORIGINS?: string;
  STORAGE_BACKEND?: string;
  STORAGE_ROOT?: string;
  STORAGE_PUBLIC_URL?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE?: string;
}

/** Build validated config from an env-like object. A Hyperdrive connection
 * string overrides DATABASE_URL on Workers. */
export function loadConfig(env: RawEnv, connectionString?: string): AppConfig {
  const databaseUrl = connectionString ?? env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL (or Hyperdrive binding) is required");

  const betterAuthSecret = env.BETTER_AUTH_SECRET;
  if (!betterAuthSecret || betterAuthSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set and at least 32 characters");
  }

  const baseUrl = requireEnv(env.BASE_URL, "BASE_URL");
  const publicUrl = env.STORAGE_PUBLIC_URL?.trim() || `${baseUrl.replace(/\/$/, "")}/api/uploads`;

  return {
    databaseUrl,
    betterAuthSecret,
    betterAuthUrl: baseUrl,
    trustedOrigins: (env.TRUSTED_ORIGINS ?? baseUrl)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    storage: loadStorageConfig(env, publicUrl),
  };
}

function loadStorageConfig(env: RawEnv, publicUrl: string): StorageConfig {
  const backend = requireEnv(env.STORAGE_BACKEND, "STORAGE_BACKEND");
  if (backend === "fs") {
    return {
      backend,
      root: requireEnv(env.STORAGE_ROOT, "STORAGE_ROOT"),
      publicUrl,
    };
  }
  if (backend === "s3") {
    return {
      backend,
      root: env.STORAGE_ROOT?.trim().replace(/^\/+|\/+$/g, "") ?? "",
      publicUrl,
      bucket: requireEnv(env.S3_BUCKET, "S3_BUCKET"),
      region: requireEnv(env.S3_REGION, "S3_REGION"),
      endpoint: requireEnv(env.S3_ENDPOINT, "S3_ENDPOINT"),
      accessKeyId: requireEnv(env.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv(env.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY"),
      forcePathStyle: parseBoolean(env.S3_FORCE_PATH_STYLE, "S3_FORCE_PATH_STYLE"),
    };
  }
  throw new Error('STORAGE_BACKEND must be either "fs" or "s3"');
}

function requireEnv(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === undefined || value.trim() === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either "true" or "false"`);
}
