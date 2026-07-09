import { DomainError, NotFoundError } from "../../domain/shared/errors";
import type {
  AgentClientUIMessage,
  AgentMessage,
  AgentModel,
  AgentSessionRepository,
  OperationEvent,
  PendingPatch,
} from "../../domain/agent";
import type { Trip, TripRepository } from "../../domain/trip";
import { ForbiddenError } from "../use-cases";
import { toTripDto, type TripDto } from "../dto";
import { applyTripOp } from "../trip/ops";
import {
  toAgentMessageDto,
  toAgentSuggestionDto,
  type AgentEventsDto,
  type AgentHistoryDto,
} from "./dto";
import { buildUserMessageParts, containsAgentMention } from "./mentions";

export { containsAgentMention } from "./mentions";

/** Thrown when an apply attempt loses a race or targets a stale suggestion.
 * Mapped to HTTP 409 at the edge. */
export class ConflictError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Schedules work that must outlive the response (evaluations, ambient
 * replies). Routes pass `executionCtx.waitUntil` on Workers and a floating
 * promise on Node. */
export type Defer = (task: Promise<void>) => void;

export interface AgentServiceOptions {
  /** Minimum model confidence before a proactive suggestion is created. */
  proactiveThreshold: number;
}

const HISTORY_LIMIT = 200;
const CHAT_CONTEXT_LIMIT = 50;
/** Status changes stay in the polling window this long so clients can retire toasts. */
const SUGGESTION_UPDATE_WINDOW_MS = 10 * 60 * 1000;

function newId(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Use cases for the shared per-trip agent session: chat, operation-triggered
 * evaluation, and suggestion lifecycle. Wired only when AI is configured. */
export class AgentService {
  constructor(
    private tripRepo: TripRepository,
    private sessionRepo: AgentSessionRepository,
    private model: AgentModel,
    private options: AgentServiceOptions,
  ) {}

  private async load(tripId: string): Promise<Trip> {
    const trip = await this.tripRepo.findById(tripId);
    if (!trip) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    return trip;
  }

  /** Members (including viewers) may read and talk; non-members get 404. */
  private async loadReadable(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.load(tripId);
    if (!trip.permissionsFor(userId).isMember) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    return trip;
  }

  private async loadEditable(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.loadReadable(tripId, userId);
    if (!trip.permissionsFor(userId).canEdit) {
      throw new ForbiddenError(
        "insufficient_permissions",
        "You do not have permission to edit this trip",
      );
    }
    return trip;
  }

  async getHistory(tripId: string, userId: string): Promise<AgentHistoryDto> {
    const trip = await this.loadReadable(tripId, userId);
    const [messages, suggestions] = await Promise.all([
      this.sessionRepo.listMessages(tripId, { limit: HISTORY_LIMIT }),
      this.sessionRepo.listActiveSuggestions(
        tripId,
        userId,
        new Date(Date.now() - SUGGESTION_UPDATE_WINDOW_MS).toISOString(),
      ),
    ]);
    return {
      messages: messages.map((m) => toAgentMessageDto(m, trip)),
      suggestions: suggestions.map(toAgentSuggestionDto),
    };
  }

  async listEvents(
    tripId: string,
    userId: string,
    afterSeq: number,
  ): Promise<AgentEventsDto> {
    const trip = await this.loadReadable(tripId, userId);
    const [latestSeq, messages, suggestions] = await Promise.all([
      this.sessionRepo.latestSeq(tripId),
      this.sessionRepo.listMessages(tripId, { afterSeq, limit: 50 }),
      this.sessionRepo.listActiveSuggestions(
        tripId,
        userId,
        new Date(Date.now() - SUGGESTION_UPDATE_WINDOW_MS).toISOString(),
      ),
    ]);
    return {
      latestSeq,
      messages: messages.map((m) => toAgentMessageDto(m, trip)),
      suggestions: suggestions.map(toAgentSuggestionDto),
    };
  }

  /** Persist a plain (non-streaming) member message. Every message is read by
   * the model; an ambient reply is generated only when the agent judges that
   * it was addressed (explicit @agent, a direct ask, or a clear request). */
  async postMessage(
    tripId: string,
    userId: string,
    text: string,
    defer: Defer,
  ): Promise<{ addressed: boolean }> {
    const trip = await this.loadReadable(tripId, userId);
    const trimmed = text.trim();
    if (!trimmed) throw new DomainError("empty_message", "Message text is required");

    const explicitMention = containsAgentMention(trimmed);
    await this.appendMessage(trip, {
      role: "user",
      parts: buildUserMessageParts(trimmed, trip, userId),
      actorUserId: userId,
      source: explicitMention ? "mention" : "chat",
    });

    // Explicit @agent always replies; otherwise ask the model whether this
    // message is addressing the agent. Member-to-member chatter stays quiet.
    if (explicitMention) {
      defer(this.generateAmbientReply(tripId));
      return { addressed: true };
    }

    defer(this.maybeReplyIfAddressed(tripId, trimmed));
    return { addressed: false };
  }

  /**
   * Stream a reply to an explicit chat/mention message, or continue after the
   * client sends AI SDK tool-approval responses.
   *
   * - Fresh turn (`approvalContinue = false`): persist the user text, then stream.
   * - Approval continue: do not re-persist the user message; streamText executes
   *   approved write tools via `applyPatch` and streams the follow-up.
   */
  async streamChat(
    tripId: string,
    userId: string,
    input: {
      text: string | null;
      /** Client UIMessage id from useChat — reused so the live buffer and
       * shared history dedupe by the same key while streaming. */
      clientMessageId?: string;
      clientMessages?: AgentClientUIMessage[];
      approvalContinue?: boolean;
    },
  ): Promise<Response> {
    const trip = await this.loadReadable(tripId, userId);
    const canEdit = trip.permissionsFor(userId).canEdit;
    const approvalContinue = input.approvalContinue === true;

    if (!approvalContinue && input.text !== null) {
      const trimmed = input.text.trim();
      if (!trimmed) throw new DomainError("empty_message", "Message text is required");
      await this.appendMessage(trip, {
        // Prefer the AI SDK client id so AgentChat can filter live vs
        // persisted with `persistedIds.has(m.id)` during the stream.
        id: input.clientMessageId?.trim() || undefined,
        role: "user",
        parts: buildUserMessageParts(trimmed, trip, userId),
        actorUserId: userId,
        source: containsAgentMention(trimmed) ? "mention" : "chat",
      });
    }

    const history = await this.sessionRepo.listMessages(tripId, {
      limit: CHAT_CONTEXT_LIMIT,
    });

    let patchQueue: Promise<void> = Promise.resolve();
    const applyPatchSequentially = (patch: PendingPatch) => {
      const run = async () => {
        try {
          // AI SDK can execute multiple approved tool calls concurrently. Run
          // them one at a time so each patch reloads the trip after the prior
          // patch has saved the aggregate.
          const editable = await this.loadEditable(tripId, userId);
          return await this.applyPatch(editable, patch, userId);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to apply trip change";
          return { ok: false as const, error: message };
        }
      };
      const result = patchQueue.then(run, run);
      patchQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };

    return this.model.streamChat({
      trip: trip.toSnapshot(),
      history,
      clientMessages: input.clientMessages,
      canEdit,
      applyPatch: applyPatchSequentially,
      onFinish: async (parts, messageId) => {
        // Do not persist mid-turn tool-approval pauses — the client keeps the
        // live UIMessage until addToolApprovalResponse continues the stream.
        // Persisting approval-requested parts would leave a dead card in the
        // shared history that other clients cannot resume.
        const awaitingApproval = parts.some((p) => {
          if (typeof p !== "object" || p === null) return false;
          return (p as { state?: unknown }).state === "approval-requested";
        });
        if (awaitingApproval) return;

        await this.appendMessage(trip, {
          // Reuse the streamed UIMessage id so the client can drop the live
          // bubble once history refetches (same key as useChat).
          id: messageId,
          role: "assistant",
          parts,
          actorUserId: null,
          source: "chat",
        });
      },
    });
  }

  /** Record a whitelisted write operation in the session and schedule the
   * AI-judged intervention decision. */
  async recordOperation(event: OperationEvent, defer: Defer): Promise<void> {
    const trip = await this.load(event.tripId);
    await this.appendMessage(trip, {
      role: "system",
      parts: [{ type: "text", text: event.summary }],
      actorUserId: event.actorUserId,
      source: "operation",
    });
    defer(this.evaluateOperation(trip, event));
  }

  /** Record an @agent mention from a collaborative surface (stop comments) and
   * schedule an ambient reply so the panel session picks it up. */
  async recordMention(
    tripId: string,
    userId: string,
    text: string,
    defer: Defer,
  ): Promise<void> {
    const trip = await this.load(tripId);
    await this.appendMessage(trip, {
      role: "user",
      parts: buildUserMessageParts(text, trip, userId),
      actorUserId: userId,
      source: "mention",
    });
    defer(this.generateAmbientReply(tripId));
  }

  /**
   * Respond to a proactive suggestion using the AI SDK approval shape
   * `{ id, approved, reason? }`. `approved: true` applies the patch through
   * the domain; `approved: false` dismisses the toast for this user only.
   */
  async respondToSuggestion(
    tripId: string,
    userId: string,
    approval: { id: string; approved: boolean; reason?: string },
  ): Promise<TripDto | { dismissed: true }> {
    if (!approval.approved) {
      await this.dismissSuggestion(tripId, approval.id, userId);
      return { dismissed: true };
    }
    return this.applySuggestion(tripId, approval.id, userId, approval.reason);
  }

  async applySuggestion(
    tripId: string,
    suggestionId: string,
    userId: string,
    reason?: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    const suggestion = await this.sessionRepo.findSuggestion(suggestionId);
    if (!suggestion || suggestion.tripId !== tripId) {
      throw new NotFoundError("suggestion_not_found", "Suggestion not found");
    }
    if (suggestion.status !== "pending") {
      throw new ConflictError(
        "suggestion_not_pending",
        "This suggestion has already been resolved",
      );
    }
    if (suggestion.expiresAt && new Date(suggestion.expiresAt) <= new Date()) {
      await this.sessionRepo.setStatus(suggestionId, "expired");
      throw new ConflictError("suggestion_expired", "This suggestion has expired");
    }
    if (trip.toSnapshot().version !== suggestion.tripVersion) {
      await this.sessionRepo.setStatus(suggestionId, "stale");
      throw new ConflictError(
        "suggestion_stale",
        "The trip changed since this suggestion was created",
      );
    }

    // Claim first so concurrent applies cannot double-run the domain operation.
    const claimed = await this.sessionRepo.claimForApply(suggestionId, userId);
    if (!claimed) {
      throw new ConflictError(
        "suggestion_not_pending",
        "This suggestion has already been resolved",
      );
    }

    try {
      const applied = await this.applyPatch(trip, suggestion.patch, userId);
      if (!applied.ok) {
        await this.sessionRepo.setStatus(suggestionId, "stale");
        throw new DomainError("patch_failed", applied.error);
      }
    } catch (err) {
      // The patch no longer fits the trip; surface it as stale, not applied.
      await this.sessionRepo.setStatus(suggestionId, "stale");
      throw err;
    }

    const actorName = trip.memberByUserId(userId)?.name ?? "A member";
    const reasonSuffix = reason?.trim() ? ` (${reason.trim()})` : "";
    await this.appendMessage(trip, {
      role: "system",
      parts: [
        {
          type: "text",
          text: `${actorName} approved the suggestion: ${suggestion.suggestionText}${reasonSuffix}`,
        },
      ],
      actorUserId: userId,
      source: "threshold",
    });

    // Reload so the DTO reflects the bumped version and persisted state.
    const updated = await this.load(tripId);
    return toTripDto(updated, userId);
  }

  /** Hide a suggestion's toast for this user only; the shared record stays. */
  async dismissSuggestion(
    tripId: string,
    suggestionId: string,
    userId: string,
  ): Promise<void> {
    await this.loadReadable(tripId, userId);
    const suggestion = await this.sessionRepo.findSuggestion(suggestionId);
    if (!suggestion || suggestion.tripId !== tripId) {
      throw new NotFoundError("suggestion_not_found", "Suggestion not found");
    }
    await this.sessionRepo.dismissForUser(suggestionId, userId);
  }

  private async appendMessage(
    trip: Trip,
    message: Pick<AgentMessage, "role" | "parts" | "actorUserId" | "source"> & {
      id?: string;
    },
  ): Promise<AgentMessage> {
    const { id, ...rest } = message;
    return this.sessionRepo.appendMessage({
      id: id && id.length > 0 ? id : newId("am"),
      tripId: trip.id,
      tripVersion: trip.toSnapshot().version,
      ...rest,
    });
  }

  private async maybeReplyIfAddressed(
    tripId: string,
    messageText: string,
  ): Promise<void> {
    try {
      const trip = await this.load(tripId);
      const history = await this.sessionRepo.listMessages(tripId, {
        limit: CHAT_CONTEXT_LIMIT,
      });
      const addressed = await this.model.isAddressed({
        trip: trip.toSnapshot(),
        history,
        messageText,
      });
      if (!addressed) return;
      await this.generateAmbientReply(tripId);
    } catch (err) {
      console.error("Agent addressed-message check failed:", err);
    }
  }

  private async generateAmbientReply(tripId: string): Promise<void> {
    try {
      const trip = await this.load(tripId);
      const history = await this.sessionRepo.listMessages(tripId, {
        limit: CHAT_CONTEXT_LIMIT,
      });
      const parts = await this.model.generateReply({
        trip: trip.toSnapshot(),
        history,
      });
      await this.appendMessage(trip, {
        role: "assistant",
        parts,
        actorUserId: null,
        source: "threshold",
      });
    } catch (err) {
      console.error("Agent ambient reply failed:", err);
    }
  }

  private async evaluateOperation(trip: Trip, event: OperationEvent): Promise<void> {
    try {
      const history = await this.sessionRepo.listMessages(event.tripId, {
        limit: CHAT_CONTEXT_LIMIT,
      });
      const decision = await this.model.evaluateOperation({
        trip: trip.toSnapshot(),
        event,
        history,
      });

      if (!decision.shouldNotify) return;

      const notify =
        decision.confidence >= this.options.proactiveThreshold &&
        decision.pendingPatch !== null;

      if (!notify) {
        // Quiet context: visible in the session timeline, but no toast.
        await this.appendMessage(trip, {
          role: "system",
          parts: [{ type: "text", text: `Observation: ${decision.reason}` }],
          actorUserId: null,
          source: "operation",
        });
        return;
      }

      const message = await this.appendMessage(trip, {
        role: "assistant",
        parts: [
          { type: "text", text: `${decision.reason}\n\n${decision.suggestion}` },
        ],
        actorUserId: null,
        source: "threshold",
      });
      await this.sessionRepo.createSuggestion({
        id: newId("as"),
        tripId: event.tripId,
        messageId: message.id,
        severity: decision.severity,
        confidence: decision.confidence,
        reason: decision.reason,
        suggestionText: decision.suggestion,
        patch: decision.pendingPatch!,
        tripVersion: trip.toSnapshot().version,
        expiresAt: decision.expiresInMinutes
          ? new Date(Date.now() + decision.expiresInMinutes * 60 * 1000).toISOString()
          : null,
      });
    } catch (err) {
      console.error("Agent operation evaluation failed:", err);
    }
  }

  /** Run the pending patch via the trip ops catalog (domain + repository). */
  private applyPatch(trip: Trip, patch: PendingPatch, actorUserId: string) {
    return applyTripOp(
      { trip, actorUserId, tripRepo: this.tripRepo },
      patch,
    );
  }
}
