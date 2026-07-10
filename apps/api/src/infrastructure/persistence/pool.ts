import type { AppConfig } from "../config";
import {
  createSqlClient,
  createRawMysqlPool,
  createRawPgPool,
  type SqlClient,
} from "./sql";

/** Create the shared SqlClient used by domain repositories. */
export function createPool(config: AppConfig, options?: { max?: number }): SqlClient {
  return createSqlClient(config.databaseProvider, config.databaseUrl, {
    max: options?.max ?? 10,
    ssl: config.databaseSsl,
  });
}

/**
 * Driver handle for Better Auth.
 * - Postgres: node-postgres `Pool`
 * - MySQL: mysql2/promise `Pool` (Kysely MysqlDialect)
 */
export function createAuthDatabase(
  config: AppConfig,
  options?: { max?: number },
): unknown {
  if (config.databaseProvider === "mysql") {
    return createRawMysqlPool(config.databaseUrl, {
      max: options?.max ?? 10,
      ssl: config.databaseSsl,
    });
  }
  return createRawPgPool(config.databaseUrl, { max: options?.max ?? 10 });
}

export type { SqlClient as Pool } from "./sql";
