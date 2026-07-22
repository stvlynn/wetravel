import { createSqlClient } from "../src/infrastructure/persistence/sql/create-sql-client";
import { resolveDatabaseProvider } from "../src/infrastructure/persistence/sql/provider";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const provider = resolveDatabaseProvider(
  process.env.DATABASE_PROVIDER,
  connectionString,
);
const db = createSqlClient(provider, connectionString, { max: 1 });
const quote = provider === "mysql" ? "`" : '"';

try {
  const [placeholders, accounts, identities, conflicts] = await Promise.all([
    db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM ${quote}user${quote}
       WHERE ${quote}emailIsPlaceholder${quote} = TRUE`,
    ),
    db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM account
       WHERE ${quote}providerId${quote} = 'wechat'`,
    ),
    db.query<{ subject_type: string; count: string | number }>(
      `SELECT subject_type, COUNT(*) AS count
       FROM external_identities WHERE provider = 'wechat'
       GROUP BY subject_type ORDER BY subject_type`,
    ),
    db.query<{
      id: string;
      primary_user_id: string;
      conflicting_user_id: string;
      subject_type: string;
      issuer: string;
      created_at: Date;
    }>(
      `SELECT id, primary_user_id, conflicting_user_id, subject_type, issuer, created_at
       FROM identity_conflicts WHERE status = 'open'
       ORDER BY created_at`,
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        placeholderUsers: Number(placeholders.rows[0]?.count ?? 0),
        wechatAccounts: Number(accounts.rows[0]?.count ?? 0),
        externalIdentities: identities.rows.map((row) => ({
          subjectType: row.subject_type,
          count: Number(row.count),
        })),
        openConflicts: conflicts.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
