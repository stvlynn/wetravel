import { spawn } from "node:child_process";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${command} ${args.join(" ")}" exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  // Use raw pg so reset does not depend on a previously generated Prisma Client.
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    console.log("dropping all tables…");
    await pool.query('DROP SCHEMA IF EXISTS "public" CASCADE');
    await pool.query('CREATE SCHEMA "public"');
    await pool.query('GRANT ALL ON SCHEMA "public" TO public');
  } finally {
    await pool.end();
  }

  // Seed (and any other Prisma Client usage) needs a generated client.
  await run("pnpm", ["exec", "prisma", "generate"]);
  await run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  await run("pnpm", ["exec", "prisma", "db", "seed"]);
  console.log("database reset complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
