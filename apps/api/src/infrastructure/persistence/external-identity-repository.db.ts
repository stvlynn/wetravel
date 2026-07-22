import type {
  ExternalIdentityOwner,
  ExternalIdentityRepository,
  WechatExternalIdentity,
} from "../../application/user/wechat-identity";
import { createDialect, type SqlClient, type SqlConnection } from "./sql";

interface IdentityRow {
  user_id: string;
  provider: string;
  subject_type: string;
  issuer: string;
  subject: string;
}

export class SqlExternalIdentityRepository
  implements ExternalIdentityRepository
{
  private readonly dialect;

  constructor(private readonly db: SqlClient) {
    this.dialect = createDialect(db.provider);
  }

  async findOwners(
    identities: readonly WechatExternalIdentity[],
  ): Promise<ExternalIdentityOwner[]> {
    const owners: ExternalIdentityOwner[] = [];
    for (const identity of identities) {
      const row = await this.findOwner(this.db, identity);
      if (row) owners.push(toOwner(row));
    }
    return owners;
  }

  async bind(
    userId: string,
    identities: readonly WechatExternalIdentity[],
  ): Promise<
    | { kind: "bound" }
    | {
        kind: "conflict";
        conflictingUserId: string;
        identity: WechatExternalIdentity;
      }
  > {
    const connection = await this.db.connect();
    try {
      await connection.query("BEGIN");
      for (const identity of identities) {
        const existing = await this.findOwner(connection, identity, true);
        if (existing && existing.user_id !== userId) {
          await connection.query("ROLLBACK");
          return {
            kind: "conflict",
            conflictingUserId: existing.user_id,
            identity,
          };
        }

        if (!existing) {
          const insert = this.dialect.insertIgnore(
            "external_identities",
            "id, user_id, provider, subject_type, issuer, subject, observed_at, verified_at, created_at, updated_at",
            `$1,$2,$3,$4,$5,$6,${this.dialect.now},${this.dialect.now},${this.dialect.now},${this.dialect.now}`,
            "provider, subject_type, issuer, subject",
          );
          await connection.query(insert, [
            crypto.randomUUID(),
            userId,
            identity.provider,
            identity.subjectType,
            identity.issuer,
            identity.subject,
          ]);
        } else {
          await connection.query(
            `UPDATE external_identities
             SET observed_at = ${this.dialect.now}, updated_at = ${this.dialect.now}
             WHERE provider = $1 AND subject_type = $2 AND issuer = $3 AND subject = $4`,
            [
              identity.provider,
              identity.subjectType,
              identity.issuer,
              identity.subject,
            ],
          );
        }

        // INSERT IGNORE / ON CONFLICT can hide a concurrent owner. Re-read
        // before commit and fail closed if another request won the race.
        const owner = await this.findOwner(connection, identity, true);
        if (!owner || owner.user_id !== userId) {
          await connection.query("ROLLBACK");
          return {
            kind: "conflict",
            conflictingUserId: owner?.user_id ?? "unknown",
            identity,
          };
        }
      }
      await connection.query("COMMIT");
      return { kind: "bound" };
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async recordConflict(input: {
    primaryUserId: string;
    conflictingUserId: string;
    identity: WechatExternalIdentity;
  }): Promise<void> {
    const subjectHash = await sha256(input.identity.subject);
    const existing = await this.db.query(
      `SELECT id FROM identity_conflicts
       WHERE provider = $1 AND primary_user_id = $2
         AND conflicting_user_id = $3 AND subject_type = $4
         AND issuer = $5 AND subject_hash = $6 AND status = 'open'`,
      [
        input.identity.provider,
        input.primaryUserId,
        input.conflictingUserId,
        input.identity.subjectType,
        input.identity.issuer,
        subjectHash,
      ],
    );
    if (existing.rowCount > 0) return;
    await this.db.query(
      `INSERT INTO identity_conflicts
         (id, provider, primary_user_id, conflicting_user_id, subject_type, issuer, subject_hash, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open',${this.dialect.now})`,
      [
        crypto.randomUUID(),
        input.identity.provider,
        input.primaryUserId,
        input.conflictingUserId,
        input.identity.subjectType,
        input.identity.issuer,
        subjectHash,
      ],
    );
  }

  private async findOwner(
    client: Pick<SqlClient, "query"> | Pick<SqlConnection, "query">,
    identity: WechatExternalIdentity,
    lock = false,
  ): Promise<IdentityRow | null> {
    const result = await client.query<IdentityRow>(
      `SELECT user_id, provider, subject_type, issuer, subject
       FROM external_identities
       WHERE provider = $1 AND subject_type = $2 AND issuer = $3 AND subject = $4${lock ? " FOR UPDATE" : ""}`,
      [
        identity.provider,
        identity.subjectType,
        identity.issuer,
        identity.subject,
      ],
    );
    return result.rows[0] ?? null;
  }
}

function toOwner(row: IdentityRow): ExternalIdentityOwner {
  return {
    userId: row.user_id,
    identity: {
      provider: "wechat",
      subjectType: row.subject_type as WechatExternalIdentity["subjectType"],
      issuer: row.issuer,
      subject: row.subject,
    },
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
