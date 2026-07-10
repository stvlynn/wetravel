#!/usr/bin/env node
/**
 * Deploy the OpenTrip API Worker.
 *
 * Database connectivity (pick one):
 *   - Worker secret DATABASE_URL (+ var DATABASE_PROVIDER / DATABASE_SSL)
 *   - Optional Hyperdrive binding in wrangler.api.jsonc
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const configPath = resolve(__dirname, "../wrangler.api.jsonc");

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
  process.exit(1);
}

console.log(`Deploying API Worker with config ${configPath}`);
console.log(
  "Ensure Worker secret DATABASE_URL is set (or a Hyperdrive binding exists).",
);

const result = spawnSync(
  "npx",
  ["--yes", "wrangler@4", "deploy", "--config", configPath],
  { cwd: root, stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
