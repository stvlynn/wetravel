import type {
  UserMergeAssessment,
  UserMergePort,
} from "../../application/user/merge-users";
import type { SqlClient, SqlConnection } from "./sql";

interface MergeUserRow {
  id: string;
  email: string;
  emailVerified: boolean | number;
  emailIsPlaceholder: boolean | number;
}

export class SqlUserMergeRepository implements UserMergePort {
  private readonly names;

  constructor(private readonly db: SqlClient) {
    this.names =
      db.provider === "mysql"
        ? {
            user: "`user`",
            account: "`account`",
            session: "`session`",
            twoFactor: "`twoFactor`",
            userId: "`userId`",
            providerId: "`providerId`",
            emailVerified: "`emailVerified`",
            emailIsPlaceholder: "`emailIsPlaceholder`",
            updatedAt: "`updatedAt`",
          }
        : {
            user: '"user"',
            account: '"account"',
            session: '"session"',
            twoFactor: '"twoFactor"',
            userId: '"userId"',
            providerId: '"providerId"',
            emailVerified: '"emailVerified"',
            emailIsPlaceholder: '"emailIsPlaceholder"',
            updatedAt: '"updatedAt"',
          };
  }

  async assess(
    canonicalUserId: string,
    duplicateUserId: string,
  ): Promise<UserMergeAssessment> {
    const blockers: string[] = [];
    const users = await this.users(this.db, canonicalUserId, duplicateUserId);
    const canonical = users.find((user) => user.id === canonicalUserId);
    const duplicate = users.find((user) => user.id === duplicateUserId);
    if (!canonical) blockers.push("canonical_user_not_found");
    if (!duplicate) blockers.push("duplicate_user_not_found");
    if (!canonical || !duplicate) {
      return { canonicalUserId, duplicateUserId, blockers };
    }

    if (
      !canonical.emailIsPlaceholder &&
      !duplicate.emailIsPlaceholder &&
      canonical.email !== duplicate.email
    ) {
      blockers.push("verified_email_conflict");
    }

    if (
      await this.bothUsersHaveRows(
        this.db,
        `SELECT DISTINCT ${this.names.userId} AS user_id
         FROM ${this.names.account}
         WHERE ${this.names.providerId} = 'credential'
           AND ${this.names.userId} IN ($1,$2)`,
        canonicalUserId,
        duplicateUserId,
      )
    ) {
      blockers.push("credential_conflict");
    }
    if (
      await this.bothUsersHaveRows(
        this.db,
        `SELECT DISTINCT ${this.names.userId} AS user_id
         FROM ${this.names.twoFactor}
         WHERE ${this.names.userId} IN ($1,$2)`,
        canonicalUserId,
        duplicateUserId,
      )
    ) {
      blockers.push("two_factor_conflict");
    }

    const checks: Array<[string, string]> = [
      [
        "shared_trip_membership",
        `SELECT 1 FROM trip_members a
         JOIN trip_members b ON b.trip_id = a.trip_id
         WHERE a.user_id = $1 AND b.user_id = $2`,
      ],
      [
        "preference_conflict",
        `SELECT 1 FROM user_preferences a
         JOIN user_preferences b ON b.user_id = $2
         WHERE a.user_id = $1`,
      ],
      [
        "invite_acceptance_conflict",
        `SELECT 1 FROM trip_invite_acceptances a
         JOIN trip_invite_acceptances b ON b.invite_id = a.invite_id
         WHERE a.user_id = $1 AND b.user_id = $2`,
      ],
      [
        "suggestion_dismissal_conflict",
        `SELECT 1 FROM agent_suggestion_dismissals a
         JOIN agent_suggestion_dismissals b
           ON b.suggestion_id = a.suggestion_id
         WHERE a.user_id = $1 AND b.user_id = $2`,
      ],
      [
        "reservation_idempotency_conflict",
        `SELECT 1 FROM reservations a
         JOIN reservations b
           ON b.trip_id = a.trip_id
          AND b.idempotency_key = a.idempotency_key
         WHERE a.created_by = $1 AND b.created_by = $2`,
      ],
    ];
    for (const [code, sql] of checks) {
      const result = await this.db.query(sql, [
        canonicalUserId,
        duplicateUserId,
      ]);
      if (result.rowCount > 0) blockers.push(code);
    }

    return { canonicalUserId, duplicateUserId, blockers };
  }

  async merge(
    canonicalUserId: string,
    duplicateUserId: string,
  ): Promise<void> {
    const connection = await this.db.connect();
    try {
      await connection.query("BEGIN");
      const users = await this.users(
        connection,
        canonicalUserId,
        duplicateUserId,
        true,
      );
      const canonical = users.find((user) => user.id === canonicalUserId);
      const duplicate = users.find((user) => user.id === duplicateUserId);
      if (!canonical || !duplicate) throw new Error("Merge user disappeared");

      if (
        canonical.emailIsPlaceholder &&
        !duplicate.emailIsPlaceholder
      ) {
        await connection.query(
          `UPDATE ${this.names.user} SET email = $1 WHERE id = $2`,
          [`merged+${duplicateUserId}@identity.invalid`, duplicateUserId],
        );
        await connection.query(
          `UPDATE ${this.names.user}
           SET email = $1, ${this.names.emailVerified} = $2,
               ${this.names.emailIsPlaceholder} = FALSE
           WHERE id = $3`,
          [
            duplicate.email,
            Boolean(duplicate.emailVerified),
            canonicalUserId,
          ],
        );
      }

      const updates: Array<[string, string]> = [
        ["trips", "owner_id"],
        ["trip_members", "user_id"],
        ["trip_invites", "created_by"],
        ["trip_invite_acceptances", "user_id"],
        ["reservations", "created_by"],
        ["agent_messages", "actor_user_id"],
        ["agent_suggestions", "applied_by"],
        ["agent_suggestion_dismissals", "user_id"],
      ];
      for (const [table, column] of updates) {
        await connection.query(
          `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
          [canonicalUserId, duplicateUserId],
        );
      }

      await connection.query(
        `UPDATE user_preferences SET user_id = $1 WHERE user_id = $2`,
        [canonicalUserId, duplicateUserId],
      );
      await connection.query(
        `UPDATE ${this.names.account}
         SET ${this.names.userId} = $1 WHERE ${this.names.userId} = $2`,
        [canonicalUserId, duplicateUserId],
      );
      await connection.query(
        `UPDATE ${this.names.twoFactor}
         SET ${this.names.userId} = $1 WHERE ${this.names.userId} = $2`,
        [canonicalUserId, duplicateUserId],
      );
      await connection.query(
        `UPDATE external_identities SET user_id = $1 WHERE user_id = $2`,
        [canonicalUserId, duplicateUserId],
      );
      await connection.query(
        `DELETE FROM ${this.names.session}
         WHERE ${this.names.userId} IN ($1,$2)`,
        [canonicalUserId, duplicateUserId],
      );
      await connection.query(
        `UPDATE identity_conflicts
         SET status = 'resolved', resolution = $1, resolved_at = CURRENT_TIMESTAMP
         WHERE status = 'open'
           AND ((primary_user_id = $2 AND conflicting_user_id = $3)
             OR (primary_user_id = $3 AND conflicting_user_id = $2))`,
        [`merged_into:${canonicalUserId}`, canonicalUserId, duplicateUserId],
      );
      await connection.query(
        `DELETE FROM ${this.names.user} WHERE id = $1`,
        [duplicateUserId],
      );
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  private async users(
    client: Pick<SqlClient, "query"> | Pick<SqlConnection, "query">,
    canonicalUserId: string,
    duplicateUserId: string,
    lock = false,
  ): Promise<MergeUserRow[]> {
    const result = await client.query<MergeUserRow>(
      `SELECT id, email,
              ${this.names.emailVerified} AS ${this.names.emailVerified},
              ${this.names.emailIsPlaceholder} AS ${this.names.emailIsPlaceholder}
       FROM ${this.names.user}
       WHERE id IN ($1,$2)${lock ? " FOR UPDATE" : ""}`,
      [canonicalUserId, duplicateUserId],
    );
    return result.rows;
  }

  private async bothUsersHaveRows(
    client: Pick<SqlClient, "query">,
    sql: string,
    canonicalUserId: string,
    duplicateUserId: string,
  ): Promise<boolean> {
    const result = await client.query<{ user_id: string }>(sql, [
      canonicalUserId,
      duplicateUserId,
    ]);
    return new Set(result.rows.map((row) => row.user_id)).size === 2;
  }
}
