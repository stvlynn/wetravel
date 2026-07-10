#!/usr/bin/env node
/**
 * Deploy the OpenTrip API Worker.
 *
 * Database (pick one):
 *   - GitHub secret / env HYPERDRIVE_ID → injects Hyperdrive binding at deploy time
 *     (never commit the id)
 *   - Worker secret DATABASE_URL for direct connect
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… HYPERDRIVE_ID=… node deploy/cloudflare/scripts/deploy-api.mjs
 */
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdtempSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const baseConfigPath = resolve(__dirname, "../wrangler.api.jsonc");

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

const tmpDir = mkdtempSync(join(tmpdir(), "opentrip-wrangler-"));
const tmpConfigPath = join(tmpDir, "wrangler.api.generated.json");
writeFileSync(tmpConfigPath, `${JSON.stringify(config, null, 2)}\n`, {
  mode: 0o600,
});

console.log(`Deploying API Worker with generated config (tmpdir).`);

const result = spawnSync(
  "npx",
  ["--yes", "wrangler@4", "deploy", "--config", tmpConfigPath],
  { cwd: root, stdio: "inherit", env: process.env },
);

try {
  unlinkSync(tmpConfigPath);
} catch {
  /* ignore */
}

process.exit(result.status ?? 1);
