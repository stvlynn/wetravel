import type { AppConfig } from "../config";
import {
  createSqlClient,
  createRawMysqlPool,
  createRawPgPool,
  createPostgresClientFromPool,
  type SqlClient,
} from "./sql";

export interface AuthDatabaseHandle {
  /** Driver instance passed to Better Auth (pg.Pool | mysql2.Pool). */
  driver: unknown;
  end: () => Promise<void>;
}

export interface DatabaseHandles {
  pool: SqlClient;
  authDatabase: AuthDatabaseHandle;
}

/**
 * Create domain SqlClient + Better Auth driver.
 *
 * Postgres uses **one** shared `pg.Pool` for both (avoids doubling Hyperdrive
 * client connections and self-deadlocks under Workers). MySQL still uses
 * separate handles; Workers path builds ephemeral pools per request.
 */
export function createDatabaseHandles(
  config: AppConfig,
  options?: { max?: number },
): DatabaseHandles {
  const max = options?.max ?? 10;

  if (config.databaseProvider === "mysql") {
    const pool = createSqlClient("mysql", config.databaseUrl, {
      max,
      ssl: config.databaseSsl,
    });
    const mysqlPool = createRawMysqlPool(config.databaseUrl, {
      max,
      ssl: config.databaseSsl,
    });
    return {
      pool,
      authDatabase: {
        driver: mysqlPool,
        end: async () => {
          await mysqlPool.end();
        },
      },
    };
  }

  const pgPool = createRawPgPool(config.databaseUrl, { max });
  return {
    pool: createPostgresClientFromPool(pgPool),
    authDatabase: {
      driver: pgPool,
      // SqlClient.end closes the same pool — dispose only once.
      end: async () => {},
    },
  };
}

/** Create the shared SqlClient used by domain repositories. */
export function createPool(
  config: AppConfig,
  options?: { max?: number },
): SqlClient {
  return createSqlClient(config.databaseProvider, config.databaseUrl, {
    max: options?.max ?? 10,
    ssl: config.databaseSsl,
  });
}

/**
 * Driver handle for Better Auth.
 * - Postgres: node-postgres `Pool`
 * - MySQL: mysql2/promise `Pool` (Kysely MysqlDialect)
 *
 * Prefer {@link createDatabaseHandles} so Postgres shares one pool with SqlClient.
 * When used alone, `end()` closes the underlying driver pool.
 */
export function createAuthDatabase(
  config: AppConfig,
  options?: { max?: number },
): AuthDatabaseHandle {
  const { pool, authDatabase } = createDatabaseHandles(config, options);
  return {
    driver: authDatabase.driver,
    end: async () => {
      await Promise.allSettled([pool.end(), authDatabase.end()]);
    },
  };
}

export type { SqlClient as Pool } from "./sql";
