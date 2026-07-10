import type {
  AgentMessage,
  AgentMessagePart,
  AgentSessionRepository,
  AgentSuggestion,
  NewAgentMessage,
  NewAgentSuggestion,
  PendingPatch,
} from "../../domain/agent";
import { createDialect, type SqlClient } from "./sql";

interface MessageRow {
  id: string;
  seq: string | number;
  trip_id: string;
  role: string;
  parts: AgentMessagePart[] | string;
  actor_user_id: string | null;
  source: string;
  trip_version: number;
  created_at: Date | string;
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
  patch: PendingPatch | string;
  trip_version: number;
  expires_at: Date | string | null;
  applied_by: string | null;
  applied_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function parseJson<T>(value: T | string): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

function toMessage(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    seq: Number(row.seq),
    tripId: row.trip_id,
    role: row.role as AgentMessage["role"],
    parts: parseJson(row.parts),
    actorUserId: row.actor_user_id,
    source: row.source as AgentMessage["source"],
    tripVersion: Number(row.trip_version),
    createdAt: new Date(row.created_at).toISOString(),
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
    patch: parseJson(row.patch),
    tripVersion: Number(row.trip_version),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at ? new Date(row.applied_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SUGGESTION_COLUMNS = `id, trip_id, message_id, status, severity, confidence, reason,
  suggestion_text, patch, trip_version, expires_at, applied_by, applied_at, created_at, updated_at`;

const MESSAGE_COLUMNS = `id, seq, trip_id, role, parts, actor_user_id, source, trip_version, created_at`;

/** Dialect-agnostic per-trip agent session repository. */
export class SqlAgentSessionRepository implements AgentSessionRepository {
  private dialect;

  constructor(private db: SqlClient) {
    this.dialect = createDialect(db.provider);
  }

  async listMessages(
    tripId: string,
    opts?: { afterSeq?: number; limit?: number },
  ): Promise<AgentMessage[]> {
    const limit = opts?.limit ?? 200;
    const afterSeq = opts?.afterSeq ?? 0;
    const { rows } = await this.db.query<MessageRow>(
      `SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS}
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
    await this.db.query(
      `INSERT INTO agent_messages (id, trip_id, role, parts, actor_user_id, source, trip_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
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
    const { rows } = await this.db.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM agent_messages WHERE id = $1`,
      [message.id],
    );
    return toMessage(rows[0]!);
  }

  async latestSeq(tripId: string): Promise<number> {
    const { rows } = await this.db.query<{ seq: string | number | null }>(
      `SELECT max(seq) AS seq FROM agent_messages WHERE trip_id = $1`,
      [tripId],
    );
    return Number(rows[0]?.seq ?? 0);
  }

  async createSuggestion(
    suggestion: NewAgentSuggestion,
  ): Promise<AgentSuggestion> {
    await this.db.query(
      `INSERT INTO agent_suggestions
         (id, trip_id, message_id, severity, confidence, reason, suggestion_text, patch, trip_version, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
    const { rows } = await this.db.query<SuggestionRow>(
      `SELECT ${SUGGESTION_COLUMNS} FROM agent_suggestions WHERE id = $1`,
      [suggestion.id],
    );
    return toSuggestion(rows[0]!);
  }

  async findSuggestion(id: string): Promise<AgentSuggestion | null> {
    const { rows } = await this.db.query<SuggestionRow>(
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
    const now = this.dialect.now;
    const { rows } = await this.db.query<SuggestionRow>(
      `SELECT ${SUGGESTION_COLUMNS} FROM agent_suggestions s
       WHERE s.trip_id = $1
         AND (
           (s.status = 'pending'
            AND (s.expires_at IS NULL OR s.expires_at > ${now})
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
    const now = this.dialect.now;
    const result = await this.db.query(
      `UPDATE agent_suggestions
       SET status = 'applied', applied_by = $2, applied_at = ${now}, updated_at = ${now}
       WHERE id = $1 AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > ${now})`,
      [id, userId],
    );
    return result.rowCount > 0;
  }

  async setStatus(
    id: string,
    status: "pending" | "stale" | "expired",
  ): Promise<void> {
    const now = this.dialect.now;
    await this.db.query(
      `UPDATE agent_suggestions SET status = $2, updated_at = ${now} WHERE id = $1`,
      [id, status],
    );
  }

  async dismissForUser(id: string, userId: string): Promise<void> {
    const sql = this.dialect.insertIgnore(
      "agent_suggestion_dismissals",
      "suggestion_id, user_id",
      "$1,$2",
      "suggestion_id, user_id",
    );
    await this.db.query(sql, [id, userId]);
  }
}

/** @deprecated Use SqlAgentSessionRepository */
export { SqlAgentSessionRepository as PgAgentSessionRepository };
