import {
  MergeUsers,
  UserMergeBlockedError,
} from "../src/application/user/merge-users";
import { createSqlClient } from "../src/infrastructure/persistence/sql/create-sql-client";
import { resolveDatabaseProvider } from "../src/infrastructure/persistence/sql/provider";
import { SqlUserMergeRepository } from "../src/infrastructure/persistence/user-merge-repository.db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const [canonicalUserId, duplicateUserId] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
if (!canonicalUserId || !duplicateUserId) {
  throw new Error(
    "Usage: db:merge-wechat-users <canonical-user-id> <duplicate-user-id> [--apply]",
  );
}

const provider = resolveDatabaseProvider(
  process.env.DATABASE_PROVIDER,
  connectionString,
);
const db = createSqlClient(provider, connectionString, { max: 1 });
const repository = new SqlUserMergeRepository(db);

try {
  const assessment = await repository.assess(
    canonicalUserId,
    duplicateUserId,
  );
  console.log(JSON.stringify(assessment, null, 2));
  if (assessment.blockers.length > 0) {
    throw new UserMergeBlockedError(assessment.blockers);
  }
  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing the assessment.");
  } else {
    await new MergeUsers(repository).execute(canonicalUserId, duplicateUserId);
    console.log(
      `Merged ${duplicateUserId} into ${canonicalUserId}; all sessions were revoked`,
    );
  }
} finally {
  await db.end();
}
