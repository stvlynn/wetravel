/**
 * One-shot MySQL bootstrap for deploy-time init:
 *   1. CREATE DATABASE IF NOT EXISTS <name from DATABASE_URL>
 *   2. Apply prisma/mysql/schema.sql
 *   3. Optionally seed when DB_INIT_SEED=true
 *
 * Intended to run from CI when repository variable DB_INIT_ON_START=true
 * (or workflow_dispatch init_db). Turn the flag off after a successful run.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=mysql://user:pass@host:port/opentrip \
 *     pnpm exec tsx --env-file-if-exists=../../.env prisma/mysql/init.ts
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { resolveDatabaseProvider } from "../../src/infrastructure/persistence/sql/provider";
import { resolveMysqlSsl } from "../../src/infrastructure/persistence/sql/mysql-client";
import type { DatabaseSslMode } from "../../src/infrastructure/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "schema.sql");

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

function resolveSslMode(): DatabaseSslMode {
  const raw = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (!raw || raw === "off" || raw === "false" || raw === "0") return "off";
  if (raw === "required" || raw === "require" || raw === "true" || raw === "1") {
    return "required";
  }
  if (raw === "verify" || raw === "verify-ca" || raw === "verify-full") {
    return "verify";
  }
  return "off";
}

function parseMysqlUrl(connectionString: string): {
  database: string;
  serverUrl: string;
  fullUrl: string;
} {
  const u = new URL(connectionString);
  const database = decodeURIComponent(u.pathname.replace(/^\//, "")).trim();
  if (!database) {
    throw new Error(
      "DATABASE_URL must include a database path, e.g. mysql://user:pass@host:3306/opentrip",
    );
  }
  // Connect without selecting a DB so CREATE DATABASE can run.
  const server = new URL(connectionString);
  server.pathname = "/";
  // Prefer system schema for the initial connection when available.
  server.pathname = "/mysql";
  return {
    database,
    serverUrl: server.toString().replace(/\/mysql\/?$/, "/mysql"),
    fullUrl: connectionString,
  };
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
  return `\`${name}\``;
}

async function createDatabaseIfNeeded(
  serverUrl: string,
  database: string,
  sslMode: DatabaseSslMode,
): Promise<void> {
  const ssl = resolveMysqlSsl(serverUrl, sslMode);
  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection({
      uri: serverUrl,
      ...(ssl ? { ssl } : {}),
    });
  } catch (err) {
    // Fallback: connect with no default schema.
    const bare = new URL(serverUrl);
    bare.pathname = "/";
    conn = await mysql.createConnection({
      uri: bare.toString(),
      ...(ssl ? { ssl } : {}),
    });
  }

  try {
    const q = quoteIdent(database);
    console.log(`Ensuring database ${q} exists…`);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${q} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`Database ${q} is ready.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to CREATE DATABASE \`${database}\`: ${msg}\n` +
        `Grant CREATE privilege to the MySQL user, or create the database in the cloud console first.`,
    );
  } finally {
    await conn.end();
  }
}

async function applySchema(fullUrl: string, sslMode: DatabaseSslMode): Promise<void> {
  const ssl = resolveMysqlSsl(fullUrl, sslMode);
  const sql = readFileSync(schemaPath, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        !s.split("\n").every((l) => l.trim().startsWith("--") || !l.trim()),
    );

  const pool = mysql.createPool({
    uri: fullUrl,
    connectionLimit: 1,
    ...(ssl ? { ssl } : {}),
  });

  try {
    console.log(`Applying MySQL schema (${statements.length} statements)…`);
    for (const statement of statements) {
      const body = statement.endsWith(";") ? statement.slice(0, -1) : statement;
      await pool.query(body);
    }
    await pool.query(
      "INSERT IGNORE INTO schema_migrations (name) VALUES (?)",
      ["mysql-bootstrap"],
    );
    console.log("MySQL schema applied.");
  } finally {
    await pool.end();
  }
}

function runSeed(): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    console.log("Running seed (DB_INIT_SEED=true)…");
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--env-file-if-exists=../../.env", "prisma/seed.ts"],
      {
        cwd: resolve(__dirname, "../.."),
        stdio: "inherit",
        env: process.env,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`seed exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const provider = resolveDatabaseProvider(
    process.env.DATABASE_PROVIDER,
    databaseUrl,
  );
  if (provider !== "mysql") {
    throw new Error(
      `prisma/mysql/init.ts is for MySQL only (got provider=${provider})`,
    );
  }

  const sslMode = resolveSslMode();
  const { database, serverUrl, fullUrl } = parseMysqlUrl(databaseUrl);

  console.log(
    `MySQL init: database=${database} ssl=${sslMode} seed=${process.env.DB_INIT_SEED ?? "false"}`,
  );

  await createDatabaseIfNeeded(serverUrl, database, sslMode);
  await applySchema(fullUrl, sslMode);

  const seedFlag = process.env.DB_INIT_SEED?.trim().toLowerCase();
  if (seedFlag === "true" || seedFlag === "1" || seedFlag === "yes") {
    await runSeed();
  }

  console.log("MySQL init complete. Set DB_INIT_ON_START=false before the next deploy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
