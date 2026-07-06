import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
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
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("dropping all tables…");
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
  await prisma.$executeRawUnsafe('GRANT ALL ON SCHEMA "public" TO public');
  await prisma.$disconnect();

  await run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  await run("pnpm", ["exec", "prisma", "db", "seed"]);
  console.log("database reset complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
