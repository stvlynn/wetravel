import type { Trip } from "@/entities/trip";
import { apiFetch } from "./client";

export type AgentMessageRole = "user" | "assistant" | "system";
export type AgentMessageSource = "chat" | "mention" | "operation" | "threshold";
export type AgentSuggestionStatus = "pending" | "applied" | "stale" | "expired";
export type AgentSeverity = "info" | "warning" | "critical";

export interface AgentMessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface AgentMessage {
  id: string;
  seq: number;
  role: AgentMessageRole;
  parts: AgentMessagePart[];
  actorUserId: string | null;
  actorName: string | null;
  source: AgentMessageSource;
  /** Better Auth user ids @mentioned in this message (excluding the author). */
  mentionedUserIds: string[];
  createdAt: string;
}

export interface AgentSuggestion {
  id: string;
  messageId: string | null;
  status: AgentSuggestionStatus;
  severity: AgentSeverity;
  reason: string;
  suggestionText: string;
  patch: unknown;
  expiresAt: string | null;
  appliedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHistory {
  messages: AgentMessage[];
  suggestions: AgentSuggestion[];
}

export interface AgentEvents {
  latestSeq: number;
  messages: AgentMessage[];
  suggestions: AgentSuggestion[];
}

/**
 * Mirrors AI SDK `addToolApprovalResponse({ id, approved, reason? })`.
 * Used for proactive suggestion approve/deny on the server.
 */
export interface AgentApprovalResponse {
  id: string;
  approved: boolean;
  reason?: string;
}

export function fetchAgentStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>("/api/agent/status");
}

export function fetchAgentMessages(tripId: string): Promise<AgentHistory> {
  return apiFetch<AgentHistory>(`/api/trips/${tripId}/agent/messages`);
}

export function postAgentMessage(
  tripId: string,
  text: string,
): Promise<{ addressed: boolean }> {
  return apiFetch<{ addressed: boolean }>(
    `/api/trips/${tripId}/agent/messages`,
    { method: "POST", body: JSON.stringify({ text }) },
  );
}

export function fetchAgentEvents(
  tripId: string,
  afterSeq: number,
): Promise<AgentEvents> {
  return apiFetch<AgentEvents>(
    `/api/trips/${tripId}/agent/events?after=${afterSeq}`,
  );
}

/** Approve or deny a proactive suggestion (AI SDK approval DTO). */
export function approveAgentSuggestion(
  tripId: string,
  approval: AgentApprovalResponse,
): Promise<Trip | { dismissed: boolean }> {
  return apiFetch<Trip | { dismissed: boolean }>(
    `/api/trips/${tripId}/agent/suggestions/${approval.id}/approve`,
    { method: "POST", body: JSON.stringify(approval) },
  );
}

/** @deprecated Prefer `approveAgentSuggestion` with `{ approved: true }`. */
export function applyAgentSuggestion(
  tripId: string,
  suggestionId: string,
): Promise<Trip> {
  return apiFetch<Trip>(
    `/api/trips/${tripId}/agent/suggestions/${suggestionId}/apply`,
    {
      method: "POST",
      body: JSON.stringify({ id: suggestionId, approved: true }),
    },
  );
}

export function dismissAgentSuggestion(
  tripId: string,
  suggestionId: string,
): Promise<{ dismissed: boolean }> {
  return apiFetch<{ dismissed: boolean }>(
    `/api/trips/${tripId}/agent/suggestions/${suggestionId}/dismiss`,
    {
      method: "POST",
      body: JSON.stringify({ id: suggestionId, approved: false }),
    },
  );
}
