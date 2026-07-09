import type { Pool } from "pg";
import type {
  AgentMessage,
  AgentMessagePart,
  AgentSessionRepository,
  AgentSuggestion,
  NewAgentMessage,
  NewAgentSuggestion,
  PendingPatch,
} from "../../domain/agent";

interface MessageRow {
  id: string;
  seq: string;
  trip_id: string;
  role: string;
  parts: AgentMessagePart[];
  actor_user_id: string | null;
  source: string;
  trip_version: number;
  created_at: Date;
}

interface SuggestionRow {
  id: string;
  trip_id: string;
  message_id: string | null;
  status: string;
  severity: string;
  confidence: number;
  reason: string;
  suggestion_text: string;
  patch: PendingPatch;
  trip_version: number;
  expires_at: Date | null;
  applied_by: string | null;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toMessage(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    seq: Number(row.seq),
    tripId: row.trip_id,
    role: row.role as AgentMessage["role"],
    parts: row.parts,
    actorUserId: row.actor_user_id,
    source: row.source as AgentMessage["source"],
    tripVersion: row.trip_version,
    createdAt: row.created_at.toISOString(),
  };
}

function toSuggestion(row: SuggestionRow): AgentSuggestion {
  return {
    id: row.id,
    tripId: row.trip_id,
    messageId: row.message_id,
    status: row.status as AgentSuggestion["status"],
    severity: row.severity as AgentSuggestion["severity"],
    confidence: Number(row.confidence),
    reason: row.reason,
    suggestionText: row.suggestion_text,
    patch: row.patch,
    tripVersion: row.trip_version,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at ? row.applied_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SUGGESTION_COLUMNS = `id, trip_id, message_id, status, severity, confidence, reason,
  suggestion_text, patch, trip_version, expires_at, applied_by, applied_at, created_at, updated_at`;

/** PostgreSQL adapter for the per-trip agent session. */
export class PgAgentSessionRepository implements AgentSessionRepository {
  constructor(private pool: Pool) {}

  async listMessages(
    tripId: string,
    opts?: { afterSeq?: number; limit?: number },
  ): Promise<AgentMessage[]> {
    const limit = opts?.limit ?? 200;
    const afterSeq = opts?.afterSeq ?? 0;
    // Fetch the most recent window, then return it in chronological order.
    const { rows } = await this.pool.query<MessageRow>(
      `SELECT * FROM (
         SELECT id, seq, trip_id, role, parts, actor_user_id, source, trip_version, created_at
         FROM agent_messages
         WHERE trip_id = $1 AND seq > $2
         ORDER BY seq DESC
         LIMIT $3
       ) recent_messages ORDER BY seq ASC`,
      [tripId, afterSeq, limit],
    );
    return rows.map(toMessage);
  }

  async appendMessage(message: NewAgentMessage): Promise<AgentMessage> {
    const { rows } = await this.pool.query<MessageRow>(
      `INSERT INTO agent_messages (id, trip_id, role, parts, actor_user_id, source, trip_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, seq, trip_id, role, parts, actor_user_id, source, trip_version, created_at`,
      [
        message.id,
        message.tripId,
        message.role,
        JSON.stringify(message.parts),
        message.actorUserId,
        message.source,
        message.tripVersion,
      ],
    );
    return toMessage(rows[0]!);
  }

  async latestSeq(tripId: string): Promise<number> {
    const { rows } = await this.pool.query<{ seq: string | null }>(
      `SELECT max(seq) AS seq FROM agent_messages WHERE trip_id = $1`,
      [tripId],
    );
    return Number(rows[0]?.seq ?? 0);
  }

  async createSuggestion(suggestion: NewAgentSuggestion): Promise<AgentSuggestion> {
    const { rows } = await this.pool.query<SuggestionRow>(
      `INSERT INTO agent_suggestions
         (id, trip_id, message_id, severity, confidence, reason, suggestion_text, patch, trip_version, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${SUGGESTION_COLUMNS}`,
      [
        suggestion.id,
        suggestion.tripId,
        suggestion.messageId,
        suggestion.severity,
        suggestion.confidence,
        suggestion.reason,
        suggestion.suggestionText,
        JSON.stringify(suggestion.patch),
        suggestion.tripVersion,
        suggestion.expiresAt,
      ],
    );
    return toSuggestion(rows[0]!);
  }

  async findSuggestion(id: string): Promise<AgentSuggestion | null> {
    const { rows } = await this.pool.query<SuggestionRow>(
      `SELECT ${SUGGESTION_COLUMNS} FROM agent_suggestions WHERE id = $1`,
      [id],
    );
    return rows[0] ? toSuggestion(rows[0]) : null;
  }

  async listActiveSuggestions(
    tripId: string,
    userId: string,
    updatedAfter: string,
  ): Promise<AgentSuggestion[]> {
    const { rows } = await this.pool.query<SuggestionRow>(
      `SELECT ${SUGGESTION_COLUMNS} FROM agent_suggestions s
       WHERE s.trip_id = $1
         AND (
           (s.status = 'pending'
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND NOT EXISTS (
              SELECT 1 FROM agent_suggestion_dismissals d
              WHERE d.suggestion_id = s.id AND d.user_id = $2
            ))
           OR s.updated_at > $3
         )
       ORDER BY s.created_at ASC`,
      [tripId, userId, updatedAfter],
    );
    return rows.map(toSuggestion);
  }

  async claimForApply(id: string, userId: string): Promise<boolean> {
    // Compare-and-set so the first successful apply wins under concurrency.
    const result = await this.pool.query(
      `UPDATE agent_suggestions
       SET status = 'applied', applied_by = $2, applied_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > now())`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setStatus(
    id: string,
    status: "pending" | "stale" | "expired",
  ): Promise<void> {
    await this.pool.query(
      `UPDATE agent_suggestions SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
  }

  async dismissForUser(id: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO agent_suggestion_dismissals (suggestion_id, user_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, userId],
    );
  }
}
