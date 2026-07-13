#!/usr/bin/env node
/**
 * Build the SPA and deploy it to Cloudflare Pages (opentrip-web).
 * Bakes BASE_URL=https://api.opentrip.im into the client bundle.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");

const API_ORIGIN =
  process.env.API_ORIGIN?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  "https://api.opentrip.im";
const PROJECT = process.env.PAGES_PROJECT || "opentrip-web";
const BRANCH = process.env.PAGES_BRANCH || "main";

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
  process.exit(1);
}

function run(cmd, args, env = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Prefer pnpm when available; CI installs it via corepack/setup.
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const captchaProvider = process.env.CAPTCHA_PROVIDER?.trim() || "";
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY?.trim() || "";
if (captchaProvider && captchaProvider !== "cloudflare-turnstile") {
  console.error(
    "CAPTCHA_PROVIDER must be cloudflare-turnstile when captcha is enabled.",
  );
  process.exit(1);
}
if (captchaProvider && !turnstileSiteKey) {
  console.error(
    "TURNSTILE_SITE_KEY is required when CAPTCHA_PROVIDER is set (public site key for the SPA build).",
  );
  process.exit(1);
}
if (captchaProvider) {
  console.log(`SPA captcha: provider=${captchaProvider}`);
} else {
  console.log("SPA captcha: disabled (CAPTCHA_PROVIDER unset)");
}

run(pnpm, ["install", "--frozen-lockfile"]);
run(pnpm, ["--filter", "@opentrip/web", "build"], {
  BASE_URL: API_ORIGIN,
  CAPTCHA_PROVIDER: captchaProvider,
  TURNSTILE_SITE_KEY: turnstileSiteKey,
});

const dist = resolve(root, "apps/web/dist");
if (!existsSync(dist)) {
  console.error("Build did not produce apps/web/dist");
  process.exit(1);
}

run("npx", [
  "--yes",
  "wrangler@4",
  "pages",
  "deploy",
  dist,
  "--project-name",
  PROJECT,
  "--branch",
  BRANCH,
  "--commit-dirty=true",
]);

console.log(`Pages deployed → https://opentrip.im (project ${PROJECT})`);
