#!/usr/bin/env node
/**
 * Sync Worker secrets to Cloudflare.
 *
 * Sources (first match wins per key):
 *   1. --file <path> JSON object of key → value
 *   2. deploy/cloudflare/.secrets.local.json
 *   3. process.env for known secret keys
 *
 * Usage:
 *   node deploy/cloudflare/scripts/sync-secrets.mjs
 *   node deploy/cloudflare/scripts/sync-secrets.mjs --file path/to/secrets.json
 *   node deploy/cloudflare/scripts/sync-secrets.mjs --from-env
 *
 * Requires CLOUDFLARE_API_TOKEN (and optional CLOUDFLARE_ACCOUNT_ID).
 * The Worker script must already exist (run deploy-api first), or pass
 * --bootstrap to only print the wrangler secret bulk payload.
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const cloudflareDir = resolve(root, "deploy/cloudflare");
const configPath = resolve(cloudflareDir, "wrangler.api.jsonc");
const defaultSecretsPath = resolve(cloudflareDir, ".secrets.local.json");

const SECRET_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "AI_API_KEY",
  "OPENWEATHERMAP_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "CAPTCHA_SECRET_KEY",
];

function parseArgs(argv) {
  const args = { file: null, fromEnv: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") args.file = argv[++i];
    else if (a === "--from-env") args.fromEnv = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node deploy/cloudflare/scripts/sync-secrets.mjs [--file path] [--from-env] [--dry-run]`);
      process.exit(0);
    }
  }
  return args;
}

function loadJson(path) {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s.startsWith("<")) continue;
    out[k] = s;
  }
  return out;
}

function loadFromEnv() {
  const out = {};
  for (const key of SECRET_KEYS) {
    const v = process.env[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

function loadRootEnvSecrets() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!SECRET_KEYS.includes(k) || !v) continue;
    // Skip local-only placeholders.
    if (v.startsWith("dev-") || v.includes("localhost") || v.startsWith("1x0000")) continue;
    out[k] = v;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const secrets = {
    ...loadRootEnvSecrets(),
    ...loadJson(defaultSecretsPath),
    ...(args.file ? loadJson(resolve(args.file)) : {}),
    ...(args.fromEnv ? loadFromEnv() : {}),
  };

  // Prefer env overrides when present (CI).
  for (const key of SECRET_KEYS) {
    if (process.env[key]?.trim()) secrets[key] = process.env[key].trim();
  }

  const keys = Object.keys(secrets).filter((k) => SECRET_KEYS.includes(k));
  if (keys.length === 0) {
    console.error(
      "No secrets to sync. Create deploy/cloudflare/.secrets.local.json or pass --file / --from-env.",
    );
    process.exit(1);
  }

  console.log(`Syncing ${keys.length} secret(s): ${keys.join(", ")}`);

  if (args.dryRun) {
    console.log(JSON.stringify(Object.fromEntries(keys.map((k) => [k, "***"])), null, 2));
    return;
  }

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error("CLOUDFLARE_API_TOKEN is required.");
    process.exit(1);
  }

  const payload = {};
  for (const k of keys) payload[k] = secrets[k];

  const tmp = resolve(cloudflareDir, `.secrets.bulk.${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 });

  try {
    const result = spawnSync(
      "npx",
      [
        "--yes",
        "wrangler@4",
        "secret",
        "bulk",
        tmp,
        "--config",
        configPath,
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log("Secrets synced.");
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

main();
