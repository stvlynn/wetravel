import type {
  AddExpenseDraft,
  InsertStopDraft,
  MoveStopDraft,
  UpdateDayDraft,
  UpdateStopDraft,
} from "../trip";

export type AgentMessageRole = "user" | "assistant" | "system";

/** What caused a message to enter the shared trip session. */
export type AgentMessageSource = "chat" | "mention" | "operation" | "threshold";

/** Minimal UI-message part shape persisted as JSON. Assistant messages may
 * carry richer AI SDK parts (tool calls, reasoning); text is the common case. */
export interface AgentTextPart {
  type: "text";
  text: string;
}

export type AgentMessagePart = AgentTextPart | { type: string; [key: string]: unknown };

export interface AgentMessage {
  id: string;
  /** Monotonic per-table sequence used as the polling cursor. */
  seq: number;
  tripId: string;
  role: AgentMessageRole;
  parts: AgentMessagePart[];
  /** Better Auth user id of the human actor, null for agent/system entries. */
  actorUserId: string | null;
  source: AgentMessageSource;
  /** Trip version at the time the message was recorded. */
  tripVersion: number;
  createdAt: string;
}

export type NewAgentMessage = Omit<AgentMessage, "seq" | "createdAt">;

export type AgentSuggestionStatus = "pending" | "applied" | "stale" | "expired";

export type AgentSeverity = "info" | "warning" | "critical";

/**
 * A patch the agent proposes. Mirrors trip-scoped editor operations on the
 * Trip aggregate (same surface as TripService mutations for a single trip).
 * Applying always goes through the normal domain methods after human approval.
 */
export type PendingPatch =
  | { kind: "rename_trip"; title: string }
  | { kind: "add_day" }
  | { kind: "delete_day"; dayNumber: number }
  | { kind: "update_day"; dayNumber: number; changes: UpdateDayDraft }
  | { kind: "reorder_days"; order: number[] }
  | { kind: "insert_stop"; draft: InsertStopDraft }
  | { kind: "update_stop"; stopId: string; changes: UpdateStopDraft }
  | { kind: "move_stop"; move: MoveStopDraft }
  | { kind: "add_expense"; draft: AddExpenseDraft }
  | { kind: "update_expense"; expenseId: string; changes: AddExpenseDraft };

export interface AgentSuggestion {
  id: string;
  tripId: string;
  /** Session message that introduced this suggestion, if any. */
  messageId: string | null;
  status: AgentSuggestionStatus;
  severity: AgentSeverity;
  /** Model confidence in [0, 1]. */
  confidence: number;
  reason: string;
  suggestionText: string;
  patch: PendingPatch;
  /** Trip version the patch was computed against. */
  tripVersion: number;
  expiresAt: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewAgentSuggestion = Omit<
  AgentSuggestion,
  "status" | "appliedBy" | "appliedAt" | "createdAt" | "updatedAt"
>;

/** A whitelisted write operation that woke the agent. */
export interface OperationEvent {
  tripId: string;
  actorUserId: string;
  actorName: string;
  /** Operation identifier, e.g. "update_stop". */
  operation: string;
  /** Human-readable one-line summary shown in the session timeline. */
  summary: string;
  /** Normalized input/diff of the operation for the model. */
  details: unknown;
}

/** Structured output the model must return when judging an operation. */
export interface InterventionDecision {
  shouldNotify: boolean;
  severity: AgentSeverity;
  confidence: number;
  reason: string;
  suggestion: string;
  pendingPatch: PendingPatch | null;
  /** Suggestion time-to-live in minutes; null means no expiry. */
  expiresInMinutes: number | null;
}

/**
 * Approval payload aligned with AI SDK `addToolApprovalResponse` /
 * `ToolApprovalResponse`: `{ id, approved, reason? }`.
 * Used for proactive suggestion apply/deny and mirrored in the chat UI.
 */
export interface AgentApprovalResponse {
  /** Suggestion id (proactive) or tool approval id (chat tool parts). */
  id: string;
  approved: boolean;
  reason?: string;
}
