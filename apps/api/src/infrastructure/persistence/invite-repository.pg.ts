import type { Pool } from "pg";
import type {
  InviteAccessScope,
  InviteMemberRole,
  InviteStatus,
  TripInviteRepository,
  TripInviteSnapshot,
} from "../../domain/invite";

/** PostgreSQL adapter for trip invites. */
export class PgTripInviteRepository implements TripInviteRepository {
  constructor(private pool: Pool) {}

  async create(invite: TripInviteSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO trip_invites
           (id, trip_id, token_hash, created_by, access_scope, role, can_invite, status, expires_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          invite.id,
          invite.tripId,
          invite.tokenHash,
          invite.createdBy,
          invite.accessScope,
          invite.role,
          invite.canInvite,
          invite.status,
          invite.expiresAt,
          invite.createdAt,
        ],
      );
      for (const email of invite.allowedEmails) {
        await client.query(
          `INSERT INTO trip_invite_allowed_emails (invite_id, email)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [invite.id, email],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findByTokenHash(tokenHash: string): Promise<TripInviteSnapshot | null> {
    const { rows } = await this.pool.query<{
      id: string;
      trip_id: string;
      token_hash: string;
      created_by: string;
      access_scope: string;
      role: string;
      can_invite: boolean;
      status: string;
      expires_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, trip_id, token_hash, created_by, access_scope, role, can_invite, status, expires_at, created_at
       FROM trip_invites WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;

    const emails = await this.pool.query<{ email: string }>(
      `SELECT email FROM trip_invite_allowed_emails WHERE invite_id = $1`,
      [row.id],
    );

    return {
      id: row.id,
      tripId: row.trip_id,
      tokenHash: row.token_hash,
      createdBy: row.created_by,
      accessScope: row.access_scope as InviteAccessScope,
      allowedEmails: emails.rows.map((e) => e.email),
      role: row.role as InviteMemberRole,
      canInvite: row.can_invite,
      status: row.status as InviteStatus,
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  async revoke(inviteId: string): Promise<void> {
    await this.pool.query(
      `UPDATE trip_invites SET status = 'revoked' WHERE id = $1`,
      [inviteId],
    );
  }

  async recordAcceptance(inviteId: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO trip_invite_acceptances (invite_id, user_id)
       VALUES ($1,$2) ON CONFLICT (invite_id, user_id) DO NOTHING`,
      [inviteId, userId],
    );
  }
}
