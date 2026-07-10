#!/usr/bin/env node
/**
 * Deploy the OpenTrip API Worker.
 *
 * Database (pick one):
 *   - GitHub secret / env HYPERDRIVE_ID → injects Hyperdrive binding at deploy time
 *     (never commit the id)
 *   - Worker secret DATABASE_URL for direct connect
 *
 * Non-secret Worker vars are taken from process.env when set (GitHub Actions
 * variables), overlaying defaults in wrangler.api.jsonc. Secrets are synced
 * separately via sync-secrets.mjs.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… HYPERDRIVE_ID=… node deploy/cloudflare/scripts/deploy-api.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
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

if (hyperdriveId) {
  if (hyperdriveId.startsWith("<") || hyperdriveId.includes("your-")) {
    console.error("HYPERDRIVE_ID looks like a placeholder.");
    process.exit(1);
  }
  config.hyperdrive = [
    {
      binding: "HYPERDRIVE",
      id: hyperdriveId,
    },
  ];
  console.log(
    "Injecting Hyperdrive binding HYPERDRIVE (id from env, not written to git).",
  );
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

try {
  unlinkSync(generatedConfigPath);
} catch {
  /* ignore */
}

process.exit(result.status ?? 1);
