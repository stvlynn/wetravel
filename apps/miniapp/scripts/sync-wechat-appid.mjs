#!/usr/bin/env node
/**
 * Writes the WeChat Mini Program AppID from apps/miniapp/.env into the
 * gitignored project.private.config.json so DevTools never needs a committed
 * AppID. Also pins compileType to miniprogram so a game-category AppID / IDE
 * cache cannot silently flip the project to looking for game.json.
 *
 * AppSecret stays on the API only (root .env → WECHAT_MINI_PROGRAM_APP_SECRET).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const miniappRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(miniappRoot, "../..");
const envPath = path.join(miniappRoot, ".env");
const privateConfigPath = path.join(miniappRoot, "project.private.config.json");

loadEnv({ path: envPath, quiet: true });

const appId = (process.env.TARO_APP_WECHAT_APP_ID ?? "").trim();

const existing = existsSync(privateConfigPath)
  ? JSON.parse(readFileSync(privateConfigPath, "utf8"))
  : {};

const next = {
  ...existing,
  // Always pin: DevTools may rewrite this when the AppID's account category is
  // "游戏", which then looks for dist/game.json instead of dist/app.json.
  compileType: "miniprogram",
};

if (!appId) {
  delete next.appid;
  writeFileSync(privateConfigPath, `${JSON.stringify(next, null, 2)}\n`);
  console.warn(
    [
      "WeChat Mini Program AppID is unset.",
      "Set TARO_APP_WECHAT_APP_ID in apps/miniapp/.env,",
      "then run: make miniapp-sync-appid",
    ].join(" "),
  );
  process.exit(0);
}

next.appid = appId;
writeFileSync(privateConfigPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(
  `Synced WeChat Mini Program AppID into ${path.relative(repoRoot, privateConfigPath)}`,
);
