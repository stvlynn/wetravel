import { placeholderEmailForUser } from "../src/application/user/email-address";
import { createDialect } from "../src/infrastructure/persistence/sql/dialect";
import { createSqlClient } from "../src/infrastructure/persistence/sql/create-sql-client";
import { resolveDatabaseProvider } from "../src/infrastructure/persistence/sql/provider";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const provider = resolveDatabaseProvider(
  process.env.DATABASE_PROVIDER,
  connectionString,
);
const db = createSqlClient(provider, connectionString, { max: 1 });
const dialect = createDialect(provider);
const identifiers =
  provider === "mysql"
    ? {
        user: "`user`",
        emailVerified: "`emailVerified`",
        emailIsPlaceholder: "`emailIsPlaceholder`",
        updatedAt: "`updatedAt`",
        userId: "`userId`",
        accountId: "`accountId`",
        providerId: "`providerId`",
      }
    : {
        user: '"user"',
        emailVerified: '"emailVerified"',
        emailIsPlaceholder: '"emailIsPlaceholder"',
        updatedAt: '"updatedAt"',
        userId: '"userId"',
        accountId: '"accountId"',
        providerId: '"providerId"',
      };

async function main(): Promise<void> {
  const connection = await db.connect();
  try {
    await connection.query("BEGIN");
    const users = await connection.query<{ id: string; email: string }>(
      `SELECT id, email FROM ${identifiers.user}
       WHERE email LIKE $1 OR ${identifiers.emailIsPlaceholder} = TRUE`,
      ["%@wechat.invalid"],
    );

    for (const user of users.rows) {
      await connection.query(
        `UPDATE ${identifiers.user}
         SET email = $1, ${identifiers.emailVerified} = ${dialect.falseLiteral},
             ${identifiers.emailIsPlaceholder} = TRUE,
             ${identifiers.updatedAt} = ${dialect.now}
         WHERE id = $2`,
        [placeholderEmailForUser(user.id), user.id],
      );
    }

    const accounts = await connection.query<{
      userId: string;
      accountId: string;
    }>(
      `SELECT ${identifiers.userId} AS userId,
              ${identifiers.accountId} AS accountId
       FROM account WHERE ${identifiers.providerId} = 'wechat'`,
    );
    const insertIdentity = dialect.insertIgnore(
      "external_identities",
      "id, user_id, provider, subject_type, issuer, subject, observed_at, created_at, updated_at",
      `$1,$2,'wechat','legacy_unknown','better-auth:wechat',$3,${dialect.now},${dialect.now},${dialect.now}`,
      "provider, subject_type, issuer, subject",
    );
    for (const account of accounts.rows) {
      await connection.query(insertIdentity, [
        crypto.randomUUID(),
        account.userId,
        account.accountId,
      ]);
    }

    await connection.query("COMMIT");
    console.log(
      `Backfilled ${users.rowCount} placeholder users and ${accounts.rowCount} legacy WeChat accounts`,
    );
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

await main().finally(() => db.end());
