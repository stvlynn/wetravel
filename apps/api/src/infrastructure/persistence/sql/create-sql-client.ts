import type { DatabaseSslMode } from "../../config";
import type { DatabaseProvider, SqlClient } from "./types";
import { createPostgresClient } from "./postgres-client";
import { createMysqlClient } from "./mysql-client";

export interface CreateSqlClientOptions {
  max?: number;
  ssl?: DatabaseSslMode;
}

export function createSqlClient(
  provider: DatabaseProvider,
  connectionString: string,
  options?: CreateSqlClientOptions,
): SqlClient {
  if (provider === "mysql") {
    return createMysqlClient(connectionString, options);
  }
  return createPostgresClient(connectionString, options);
}
