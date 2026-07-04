import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../infrastructure/persistence/pool";

const here = dirname(fileURLToPath(import.meta.url));

function runScript(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tsx", [join(here, name)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const pool = createPool(url);
  console.log("dropping all tables…");
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO public");
  await pool.end();

  await runScript("migrate.ts");
  await runScript("seed.ts");
  console.log("database reset complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
