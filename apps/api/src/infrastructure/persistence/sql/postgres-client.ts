import pg from "pg";
import type { QueryResult, SqlClient, SqlConnection } from "./types";

export interface PgPoolOptions {
  max?: number;
  /** Fail instead of hanging forever when Hyperdrive/origin is stuck (ms). */
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

const DEFAULT_CONNECTION_TIMEOUT_MS = 8_000;
const DEFAULT_IDLE_TIMEOUT_MS = 20_000;

function poolConfig(
  connectionString: string,
  options?: PgPoolOptions,
): pg.PoolConfig {
  return {
    connectionString,
    max: options?.max ?? 10,
    // Workers hang → CF 1101 with no CORS when TCP never settles. Prefer fail-fast.
    connectionTimeoutMillis:
      options?.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: options?.idleTimeoutMillis ?? DEFAULT_IDLE_TIMEOUT_MS,
    allowExitOnIdle: true,
  };
}

/** Wrap an existing node-postgres Pool as SqlClient (share one pool with Better Auth). */
export function createPostgresClientFromPool(pool: pg.Pool): SqlClient {
  return {
    provider: "postgres",
    async query<T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<QueryResult<T>> {
      const result = await pool.query(text, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    },
    async connect(): Promise<SqlConnection> {
      const client = await pool.connect();
      return {
        async query<T = Record<string, unknown>>(
          text: string,
          params: unknown[] = [],
        ): Promise<QueryResult<T>> {
          const result = await client.query(text, params);
          return {
            rows: result.rows as T[],
            rowCount: result.rowCount ?? 0,
          };
        },
        release() {
          client.release();
        },
      };
    },
    async end() {
      await pool.end();
    },
  };
}

export function createPostgresClient(
  connectionString: string,
  options?: PgPoolOptions,
): SqlClient {
  return createPostgresClientFromPool(
    createRawPgPool(connectionString, options),
  );
}

/** Expose the raw pg Pool for Better Auth (expects a node-postgres Pool). */
export function createRawPgPool(
  connectionString: string,
  options?: PgPoolOptions,
): pg.Pool {
  return new pg.Pool(poolConfig(connectionString, options));
}
