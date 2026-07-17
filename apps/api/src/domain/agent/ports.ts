import type { TripSnapshot } from "../trip";
import type {
  AgentMessage,
  AgentMessagePart,
  AgentSuggestion,
  AgentStreetViewGrounding,
  InterventionDecision,
  NewAgentMessage,
  NewAgentSuggestion,
  OperationEvent,
  PendingPatch,
} from "./types";

/** Persistence port for the per-trip agent session (messages + suggestions). */
export interface AgentSessionRepository {
  listMessages(
    tripId: string,
    opts?: { afterSeq?: number; limit?: number },
  ): Promise<AgentMessage[]>;
  appendMessage(message: NewAgentMessage): Promise<AgentMessage>;
  latestSeq(tripId: string): Promise<number>;

  createSuggestion(suggestion: NewAgentSuggestion): Promise<AgentSuggestion>;
  findSuggestion(id: string): Promise<AgentSuggestion | null>;
  /** Pending suggestions not dismissed by the given user, plus any suggestion
   * whose status changed after `updatedAfter` (so clients can retire toasts). */
  listActiveSuggestions(
    tripId: string,
    userId: string,
    updatedAfter: string,
  ): Promise<AgentSuggestion[]>;
  /** Atomically claim a pending suggestion for apply. Returns false when it
   * was no longer pending (someone else applied or it went stale). */
  claimForApply(id: string, userId: string): Promise<boolean>;
  setStatus(id: string, status: "pending" | "stale" | "expired"): Promise<void>;
  dismissForUser(id: string, userId: string): Promise<void>;
}

/** Minimal UI message shape accepted from the AI SDK client (useChat). */
export interface AgentClientUIMessage {
  id?: string;
  role: string;
  parts: AgentMessagePart[];
}

export interface AgentObservabilityContext {
  requestId?: string;
  turnId: string;
  trigger: "chat" | "ambient" | "addressed_check" | "operation";
  runtime?: "cloudflare" | "node";
}

/** Result returned by write tools after the user approves them.
 * `trip` is the post-apply client DTO (write-echo) so the SPA can
 * `setQueryData` without refetching through Hyperdrive. */
export type AgentToolApplyResult =
  | { ok: true; summary: string; trip: object }
  | { ok: false; error: string };

export interface AgentChatRequest {
  trip: TripSnapshot;
  history: AgentMessage[];
  observability: AgentObservabilityContext;
  /** Deterministic application-layer result for an explicit street-view turn. */
  streetViewGrounding?: AgentStreetViewGrounding;
  /**
   * Full UI messages from the current client turn. Required for AI SDK tool
   * approval continuation (`approval-responded` parts → tool execution).
   */
  clientMessages?: AgentClientUIMessage[];
  /** Whether the caller may approve write tools. Viewers get auto-denied. */
  canEdit: boolean;
  /**
   * Invoked only after AI SDK tool approval. Runs the patch through the Trip
   * aggregate; never called while a tool is still waiting on the user.
   */
  applyPatch: (patch: PendingPatch) => Promise<AgentToolApplyResult>;
  /** Called once the stream completes (skip mid-turn approval pauses).
   * `messageId` is the AI SDK UIMessage id so shared history matches the
   * live buffer for dedupe. */
  onFinish: (parts: AgentMessagePart[], messageId?: string) => Promise<void>;
}

export interface AgentReplyRequest {
  trip: TripSnapshot;
  history: AgentMessage[];
  observability: AgentObservabilityContext;
  streetViewGrounding?: AgentStreetViewGrounding;
}

export interface AgentEvaluationRequest {
  trip: TripSnapshot;
  event: OperationEvent;
  /** Recent session context so repeated notifications stay suppressed. */
  history: AgentMessage[];
  observability: AgentObservabilityContext;
}

/** Decide whether a plain member message is addressing the agent. */
export interface AgentAddressedRequest {
  trip: TripSnapshot;
  history: AgentMessage[];
  /** Latest member message text (already persisted). */
  messageText: string;
  observability: AgentObservabilityContext;
}

/** Model port. Implemented in infrastructure with the Vercel AI SDK; the
 * domain and application layers never touch provider APIs directly. */
export interface AgentModel {
  /** Stream a chat reply as a web Response carrying an AI SDK UI message stream. */
  streamChat(request: AgentChatRequest): Promise<Response>;
  /** Generate a non-streaming reply (ambient / mention replies). Read-only tools only. */
  generateReply(request: AgentReplyRequest): Promise<AgentMessagePart[]>;
  /**
   * Judge whether a plain member message is addressing the agent. Prefer true
   * when the prior turn was the agent and the member continues that thread
   * (confirmations, choices, follow-up questions). Default false for
   * human-to-human chatter.
   */
  isAddressed(request: AgentAddressedRequest): Promise<boolean>;
  /** Judge a whitelisted operation and return a structured decision. */
  evaluateOperation(request: AgentEvaluationRequest): Promise<InterventionDecision>;
}
