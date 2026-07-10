import mysql from "mysql2/promise";
import type {
  Pool as MysqlPool,
  PoolConnection as MysqlPoolConnection,
  QueryResult as MysqlQueryResult,
  ResultSetHeader,
  SslOptions,
} from "mysql2/promise";
import type { DatabaseSslMode } from "../../config";
import { toMysqlPlaceholders } from "./placeholders";
import type { QueryResult, SqlClient, SqlConnection } from "./types";

export interface MysqlClientOptions {
  max?: number;
  ssl?: DatabaseSslMode;
}

function mapResult<T>(result: MysqlQueryResult): QueryResult<T> {
  // SELECT → RowDataPacket[]; INSERT/UPDATE → ResultSetHeader
  if (Array.isArray(result)) {
    return {
      rows: result as T[],
      rowCount: result.length,
    };
  }
  const header = result as ResultSetHeader;
  return {
    rows: [] as T[],
    rowCount: header.affectedRows ?? 0,
  };
}

function normalizeParams(params: unknown[]): unknown[] {
  // mysql2 rejects nested arrays; booleans are fine as 0/1 automatically.
  return params.map((p) => {
    if (p instanceof Date) return p;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

/** Build mysql2 SSL option from app config + URL hints. */
export function resolveMysqlSsl(
  connectionString: string,
  mode: DatabaseSslMode = "required",
): SslOptions | undefined {
  const urlHintsSsl =
    /[?&](ssl|sslmode)=(true|require|required|verify|verify-ca|verify-full)/i.test(
      connectionString,
    ) ||
    connectionString.includes("sslaccept=") ||
    connectionString.includes("ssl-mode=");

  const effective: DatabaseSslMode =
    mode === "off" && urlHintsSsl ? "required" : mode;

  if (effective === "off") return undefined;
  // Managed MySQL (e.g. Tencent CynosDB) often presents a provider CA that is
  // not in the default trust store; `required` enables TLS without CA pin.
  if (effective === "required") {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

function poolConfig(
  connectionString: string,
  options?: MysqlClientOptions,
): mysql.PoolOptions {
  const ssl = resolveMysqlSsl(connectionString, options?.ssl ?? "required");
  return {
    uri: connectionString,
    connectionLimit: options?.max ?? 10,
    dateStrings: false,
    supportBigNumbers: true,
    // Enable TCP keep-alive; helps long-lived Node processes.
    enableKeepAlive: true,
    ...(ssl ? { ssl } : {}),
  };
}

export function createMysqlClient(
  connectionString: string,
  options?: MysqlClientOptions,
): SqlClient {
  const pool = mysql.createPool(poolConfig(connectionString, options));

  async function runQuery<T>(
    executor: Pick<MysqlPool, "query"> | Pick<MysqlPoolConnection, "query">,
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const sql = toMysqlPlaceholders(text);
    const [result] = await executor.query(sql, normalizeParams(params));
    return mapResult<T>(result);
  }

  return {
    provider: "mysql",
    query: (text, params) => runQuery(pool, text, params),
    async connect(): Promise<SqlConnection> {
      const conn = await pool.getConnection();
      return {
        query: (text, params) => runQuery(conn, text, params),
        release() {
          conn.release();
        },
      };
    },
    async end() {
      await pool.end();
    },
  };
}

/** Raw mysql2 pool for Better Auth Kysely MysqlDialect. */
export function createRawMysqlPool(
  connectionString: string,
  options?: MysqlClientOptions,
): MysqlPool {
  return mysql.createPool(poolConfig(connectionString, options));
}
