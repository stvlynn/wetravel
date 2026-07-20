#!/usr/bin/env node
/**
 * Deploy the OpenTrip API Worker.
 *
 * Database (pick one):
 *   - GitHub secret / env HYPERDRIVE_ID → injects Hyperdrive binding at deploy time
 *     (never commit the id). Optional HYPERDRIVE_CACHE_DISABLED_ID adds a second
 *     cache-disabled binding for consistency-critical business repositories.
 *   - Worker secret DATABASE_URL for direct connect
 *
 * Non-secret Worker vars are taken from process.env when set (GitHub Actions
 * variables), overlaying defaults in wrangler.api.jsonc. Secrets are synced
 * separately via sync-secrets.mjs.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… HYPERDRIVE_ID=… \
 *     HYPERDRIVE_CACHE_DISABLED_ID=… node deploy/cloudflare/scripts/deploy-api.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const cloudflareDir = resolve(__dirname, "..");
const baseConfigPath = resolve(cloudflareDir, "wrangler.api.jsonc");
// Keep generated config beside the base file so relative `main` paths resolve.
const generatedConfigPath = resolve(
  cloudflareDir,
  "wrangler.api.generated.json",
);

/** Non-secret Worker `vars` that CI may override from GitHub Actions variables. */
const WORKER_VAR_KEYS = [
  "BASE_URL",
  "TRUSTED_ORIGINS",
  "DATABASE_PROVIDER",
  "DATABASE_SSL",
  "STORAGE_BACKEND",
  "STORAGE_ROOT",
  "STORAGE_PUBLIC_URL",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_FORCE_PATH_STYLE",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_BASE_URL",
  "AI_PROACTIVE_THRESHOLD",
  "AI_MAX_TOOL_STEPS",
  "AI_TELEMETRY_RECORD_CONTENT",
  "SENTRY_ENVIRONMENT",
  "SENTRY_RELEASE",
  "STREET_VIEW_PROVIDER",
  "STREET_VIEW_TIMEOUT_MS",
  "GEO_PROVIDER",
  "GEO_OSM_USER_AGENT",
  "GEO_OSM_NOMINATIM_URL",
  "GEO_OSM_OVERPASS_URL",
  "GEO_OSM_OSRM_URL",
  "GEO_TIMEOUT_MS",
  "GEO_CACHE_TTL_MS",
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "CAPTCHA_PROVIDER",
];

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
  process.exit(1);
}

function stripJsoncComments(source) {
  // Remove // line comments and /* */ blocks outside of strings (good enough for our config).
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function loadConfigObject(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(stripJsoncComments(raw));
}

/** Prefer explicit BASE_URL; otherwise map API_BASE_URL (Actions naming). */
function resolveBaseUrlEnv() {
  const base = process.env.BASE_URL?.trim();
  if (base) return base;
  return process.env.API_BASE_URL?.trim() || "";
}

const config = loadConfigObject(baseConfigPath);
const hyperdriveId = process.env.HYPERDRIVE_ID?.trim();
const hyperdriveFreshId = process.env.HYPERDRIVE_CACHE_DISABLED_ID?.trim();
const r2BucketName = process.env.R2_BUCKET_NAME?.trim();

function assertHyperdriveId(name, id) {
  if (id.startsWith("<") || id.includes("your-")) {
    console.error(`${name} looks like a placeholder.`);
    process.exit(1);
  }
}

if (hyperdriveId) {
  assertHyperdriveId("HYPERDRIVE_ID", hyperdriveId);
  config.hyperdrive = [
    {
      binding: "HYPERDRIVE",
      id: hyperdriveId,
    },
  ];
  console.log(
    "Injecting Hyperdrive binding HYPERDRIVE (id from env, not written to git).",
  );
  if (hyperdriveFreshId) {
    assertHyperdriveId("HYPERDRIVE_CACHE_DISABLED_ID", hyperdriveFreshId);
    config.hyperdrive.push({
      binding: "HYPERDRIVE_CACHE_DISABLED",
      id: hyperdriveFreshId,
    });
    console.log(
      "Injecting Hyperdrive binding HYPERDRIVE_CACHE_DISABLED (cache-disabled fresh reads).",
    );
  } else {
    console.log(
      "No HYPERDRIVE_CACHE_DISABLED_ID — auth/agent fresh reads fall back to HYPERDRIVE.",
    );
  }
} else {
  delete config.hyperdrive;
  console.log(
    "No HYPERDRIVE_ID env — deploying without Hyperdrive (use DATABASE_URL secret).",
  );
}

config.vars = { ...(config.vars ?? {}) };
const overridden = [];
const baseUrl = resolveBaseUrlEnv();
if (baseUrl) {
  config.vars.BASE_URL = baseUrl;
  overridden.push("BASE_URL");
}
for (const key of WORKER_VAR_KEYS) {
  if (key === "BASE_URL") continue;
  const value = process.env[key]?.trim();
  if (!value) continue;
  config.vars[key] = value;
  overridden.push(key);
}
if (overridden.length > 0) {
  console.log(`Overlaying Worker vars from env: ${overridden.join(", ")}`);
}

// Production storage must come from Actions (or local env), not committed
// wrangler defaults — refuse to ship without an explicit bucket/endpoint.
const storageBackend = (config.vars.STORAGE_BACKEND || "").trim();
if (storageBackend === "s3") {
  const missing = ["S3_BUCKET", "S3_ENDPOINT"].filter(
    (key) => !String(config.vars[key] || "").trim(),
  );
  if (missing.length > 0) {
    console.error(
      `STORAGE_BACKEND=s3 requires ${missing.join(" and ")} from env ` +
        `(GitHub Actions variables). Do not commit production R2 values in wrangler.api.jsonc.`,
    );
    process.exit(1);
  }
}
if (storageBackend === "r2") {
  if (!r2BucketName) {
    console.error(
      "STORAGE_BACKEND=r2 requires R2_BUCKET_NAME from env " +
        "(GitHub Actions variable). Do not commit production R2 values.",
    );
    process.exit(1);
  }
  config.r2_buckets = [
    {
      binding: "R2_FILE_STORAGE",
      bucket_name: r2BucketName,
    },
  ];
  console.log(
    "Injecting R2 binding R2_FILE_STORAGE (bucket name from env, not written to git).",
  );
} else {
  delete config.r2_buckets;
}

writeFileSync(generatedConfigPath, `${JSON.stringify(config, null, 2)}\n`, {
  mode: 0o600,
});

console.log(
  `Deploying API Worker with generated config (gitignored, same dir as base).`,
);

const result = spawnSync(
  "npx",
  ["--yes", "wrangler@4", "deploy", "--config", generatedConfigPath],
  { cwd: root, stdio: "inherit", env: process.env },
);
let finalStatus = result.status ?? 1;

if (
  result.status === 0 &&
  process.env.SENTRY_AUTH_TOKEN?.trim() &&
  process.env.SENTRY_ORG?.trim() &&
  process.env.SENTRY_PROJECT?.trim() &&
  process.env.SENTRY_RELEASE?.trim()
) {
  const sourceMapDir = resolve(cloudflareDir, ".sentry-worker");
  const dryRun = spawnSync(
    "npx",
    [
      "--yes",
      "wrangler@4",
      "deploy",
      "--dry-run",
      "--outdir",
      sourceMapDir,
      "--config",
      generatedConfigPath,
    ],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (dryRun.status === 0) {
    const upload = spawnSync(
      "pnpm",
      [
        "--filter",
        "@opentrip/api",
        "exec",
        "sentry-cli",
        "sourcemaps",
        "upload",
        "--org",
        process.env.SENTRY_ORG.trim(),
        "--project",
        process.env.SENTRY_PROJECT.trim(),
        "--release",
        process.env.SENTRY_RELEASE.trim(),
        sourceMapDir,
      ],
      { cwd: root, stdio: "inherit", env: process.env },
    );
    if (upload.status !== 0) {
      console.error("Sentry source-map upload failed.");
      finalStatus = upload.status ?? 1;
    }
  } else {
    console.error("Worker source-map dry run failed.");
    finalStatus = dryRun.status ?? 1;
  }
  rmSync(sourceMapDir, { recursive: true, force: true });
}

try {
  unlinkSync(generatedConfigPath);
} catch {
  /* ignore */
}

process.exit(finalStatus);
