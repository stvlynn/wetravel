import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

/** Create a Prisma Client backed by a pg driver adapter. The caller is responsible
 * for calling `$disconnect()` on shutdown. */
export function createPrismaClient(connectionString: string): PrismaClient {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
