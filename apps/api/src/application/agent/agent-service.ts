import { DomainError, NotFoundError } from "../../domain/shared/errors";
import type {
  AgentClientUIMessage,
  AgentMessage,
  AgentModel,
  AgentObservabilityContext,
  AgentSessionRepository,
  AgentStreetViewGrounding,
  OperationEvent,
  PendingPatch,
} from "../../domain/agent";
import {
  isAgentGroundingPart,
  isAgentStatusPart,
  isAgentUiPart,
  sanitizeAgentUiParts,
} from "@opentrip/agent-ui-catalog";
import {
  fingerprintMessageText,
  textFromMessageParts,
} from "@opentrip/observability-contract";
import type { Trip, TripRepository } from "../../domain/trip";
import type { TripChangePublisher } from "../../domain/realtime";
import { AGENT_COMMENT_AUTHOR } from "../../domain/trip";
import { ForbiddenError } from "../use-cases";
import { toTripDto, type TripDto } from "../dto";
import { applyTripOp, getTripOp } from "../trip/ops";
import {
  toAgentMessageDto,
  toAgentSuggestionDto,
  type AgentEventsDto,
  type AgentHistoryDto,
  type AgentMessageDto,
} from "./dto";
import {
  filePartsFromMessageParts,
  sanitizeAgentFileParts,
  type AgentFilePart,
} from "./file-parts";
import { buildUserMessageParts, containsAgentMention, mentionedUserIdsFromParts } from "./mentions";
import { looksLikeAgentThreadFollowUp } from "./addressed";
import { createSequentialTripPatchApplier } from "./sequential-trip-patch-applier";
import {
  destinationCenterFromTrip,
  type StreetViewGroundingService,
} from "./street-view-grounding-service";
import {
  noopObservability,
  type Observability,
  type RuntimeName,
} from "../observability";

export { containsAgentMention } from "./mentions";
export { looksLikeAgentThreadFollowUp } from "./addressed";
export { createSequentialTripPatchApplier } from "./sequential-trip-patch-applier";

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

interface AgentExecutionContext {
  requestId?: string;
  runtime?: RuntimeName;
  turnId?: string;
}

function modelObservability(
  trigger: AgentObservabilityContext["trigger"],
  context: AgentExecutionContext = {},
): AgentObservabilityContext {
  return {
    requestId: context.requestId,
    runtime: context.runtime,
    turnId: context.turnId ?? newId("turn_"),
    trigger,
  };
}

export function initiatingAgentTurnId(
  clientMessages: AgentClientUIMessage[] | undefined,
  fallback?: string,
): string {
  const userId = [...(clientMessages ?? [])]
    .reverse()
    .find((message) => message.role === "user")?.id;
  return userId?.trim() || fallback?.trim() || newId("turn_");
}

/** Flatten text parts from an ambient reply for stop-comment persistence. */
function textFromAgentParts(parts: AgentMessage["parts"]): string {
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof (p as { text?: unknown }).text === "string",
    )
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/** True when a streamed assistant UIMessage has anything worth persisting. */
export function assistantPartsHaveContent(parts: AgentMessage["parts"]): boolean {
  return parts.some((p) => {
    if (typeof p !== "object" || p === null) return false;
    const type = (p as { type?: unknown }).type;
    if (type === "text" || type === "reasoning") {
      const text = (p as { text?: unknown }).text;
      return typeof text === "string" && text.trim().length > 0;
    }
    if (typeof type === "string" && type.startsWith("tool-")) return true;
    if (type === "file") return true;
    if (isAgentGroundingPart(p as { type: string; data?: unknown })) return true;
    if (isAgentStatusPart(p as { type: string; data?: unknown })) return true;
    if (isAgentUiPart(p as { type: string; data?: unknown })) return true;
    return false;
  });
}

/** Use cases for the shared per-trip agent session: chat, operation-triggered
 * evaluation, and suggestion lifecycle. Wired only when AI is configured. */
export class AgentService {
  constructor(
    private tripRepo: TripRepository,
    private sessionRepo: AgentSessionRepository,
    private model: AgentModel,
    private streetViewGroundingService: StreetViewGroundingService,
    private options: AgentServiceOptions,
    private tripChangePublisher: TripChangePublisher | null = null,
    private observability: Observability = noopObservability,
  ) {}

  private async load(tripId: string): Promise<Trip> {
    return this.observability.startSpan("opentrip.agent.load_trip", { tripId }, async () => {
      const trip = await this.tripRepo.findById(tripId);
      if (!trip) {
        throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
      }
      return trip;
    });
  }

  private listContextMessages(tripId: string): Promise<AgentMessage[]> {
    return this.observability.startSpan(
      "opentrip.agent.load_history",
      { tripId, historyLimit: CHAT_CONTEXT_LIMIT },
      () => this.sessionRepo.listMessages(tripId, { limit: CHAT_CONTEXT_LIMIT }),
    );
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

  /** Persist a plain (non-streaming) member message. Street-view requests are
   * resolved deterministically; other messages use the model to decide whether
   * the agent was addressed (explicit @agent, a direct ask, or a clear request).
   * Returns the inserted message so clients can update cache without a stale
   * Hyperdrive list GET. */
  async postMessage(
    tripId: string,
    userId: string,
    input: {
      text?: string;
      files?: AgentFilePart[];
      observability?: AgentExecutionContext;
    },
    defer: Defer,
  ): Promise<{ addressed: boolean; message: AgentMessageDto }> {
    const trip = await this.loadReadable(tripId, userId);
    const trimmed = (input.text ?? "").trim();
    const files = sanitizeAgentFileParts(input.files ?? [], tripId);
    if (!trimmed && files.length === 0) {
      throw new DomainError(
        "empty_message",
        "Message text or attachment is required",
      );
    }

    const explicitMention = containsAgentMention(trimmed);
    const executionContext = {
      ...input.observability,
      turnId: input.observability?.turnId ?? newId("turn_"),
    };
    const message = await this.appendMessage(trip, {
      role: "user",
      parts: buildUserMessageParts(trimmed, trip, userId, files),
      actorUserId: userId,
      source: explicitMention ? "mention" : "chat",
    }, executionContext);
    const messageDto = toAgentMessageDto(message, trip);

    const addressedHint =
      trimmed || (files.length > 0 ? "(attachment)" : "");

    // Explicit @agent always replies; otherwise ask the model whether this
    // message is addressing the agent. Member-to-member chatter stays quiet.
    if (explicitMention) {
      defer(
        this.generateAmbientReply(
          tripId,
          undefined,
          modelObservability("ambient", executionContext),
        ),
      );
      return { addressed: true, message: messageDto };
    }

    defer(
      this.maybeReplyIfAddressed(
        tripId,
        addressedHint,
        modelObservability("addressed_check", executionContext),
      ),
    );
    return { addressed: false, message: messageDto };
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
      requestId?: string;
      runtime?: RuntimeName;
      turnId?: string;
    },
    /** Keep the Workers SQL pool open until stream persistence finishes. */
    defer: Defer = () => {},
  ): Promise<Response> {
    const trip = await this.loadReadable(tripId, userId);
    const canEdit = trip.permissionsFor(userId).canEdit;
    const approvalContinue = input.approvalContinue === true;
    const turnId =
      input.turnId ??
      initiatingAgentTurnId(input.clientMessages, input.clientMessageId);
    const observability = modelObservability("chat", {
      requestId: input.requestId,
      runtime: input.runtime,
      turnId,
    });

    if (!approvalContinue) {
      const trimmed = (input.text ?? "").trim();
      const latestUser = [...(input.clientMessages ?? [])]
        .reverse()
        .find((m) => m.role === "user");
      const files = filePartsFromMessageParts(latestUser?.parts, tripId);
      if (!trimmed && files.length === 0) {
        throw new DomainError(
          "empty_message",
          "Message text or attachment is required",
        );
      }
      await this.appendMessage(trip, {
        // Prefer the AI SDK client id so AgentChat can filter live vs
        // persisted with `persistedIds.has(m.id)` during the stream.
        id: input.clientMessageId?.trim() || latestUser?.id?.trim() || undefined,
        role: "user",
        parts: buildUserMessageParts(trimmed, trip, userId, files),
        actorUserId: userId,
        source: containsAgentMention(trimmed) ? "mention" : "chat",
      }, observability);
    }

    const history = await this.listContextMessages(tripId);
    const streetViewGrounding = approvalContinue
      ? undefined
      : (await this.streetViewGroundingService.resolve({
          tripId,
          history,
          near: destinationCenterFromTrip(trip.toSnapshot()),
          observability,
        })) ?? undefined;

    // One in-memory Trip for this request — never findById between patches
    // (Hyperdrive SELECT cache would echo stale sibling days/stops).
    const applyPatchSequentially = createSequentialTripPatchApplier({
      loadEditable: () => this.loadEditable(tripId, userId),
      apply: (editable, patch) => this.applyPatch(editable, patch, userId),
      toDto: (editable) => toTripDto(editable, userId),
    });

    // Hold the per-request pool open until onFinish persistence settles.
    // Without this, Workers disposeAfterDeferred() ends the pool as soon as
    // the SSE Response is returned, and appendMessage fails → the SPA clears
    // the live buffer and the reply vanishes.
    let releasePersistHold!: () => void;
    const persistHold = new Promise<void>((resolve) => {
      releasePersistHold = resolve;
    });
    defer(persistHold);

    const chatSpan = this.observability.startTrace("opentrip.agent.chat", {
      requestId: observability.requestId,
      tripId,
      agentSessionId: tripId,
      turnId,
      trigger: "chat",
      runtime: observability.runtime,
    });
    try {
      const response = await chatSpan.run(() =>
        this.model.streamChat({
          trip: trip.toSnapshot(),
          history,
          streetViewGrounding,
          clientMessages: input.clientMessages,
          canEdit,
          observability,
          applyPatch: applyPatchSequentially,
          onFinish: async (parts, messageId) => {
            try {
              // Do not persist mid-turn tool-approval pauses — the client keeps the
              // live UIMessage until addToolApprovalResponse continues the stream.
              // Persisting approval-requested parts would leave a dead card in the
              // shared history that other clients cannot resume.
              const awaitingApproval = parts.some((p) => {
                if (typeof p !== "object" || p === null) return false;
                return (p as { state?: unknown }).state === "approval-requested";
              });
              if (awaitingApproval) return;

              // Stream errors (e.g. wrong MiniMax base URL → 404) still fire
              // onFinish with an empty UIMessage. Do not leave a blank bubble.
              if (!assistantPartsHaveContent(parts)) return;

              const safeParts = sanitizeAgentUiParts(parts);
              if (!assistantPartsHaveContent(safeParts)) return;
              await this.appendMessage(trip, {
                // Reuse the streamed UIMessage id so the client can drop the live
                // bubble once history refetches (same key as useChat).
                id: messageId,
                role: "assistant",
                parts: safeParts,
                actorUserId: null,
                source: "chat",
              }, observability);
              this.observability.logger.info("agent.stream.complete", {
                runtime: observability.runtime,
                requestId: observability.requestId,
                tripId,
                turnId,
                messageId,
              });
            } finally {
              releasePersistHold();
              chatSpan.end();
            }
          },
        }),
      );
      if (!response.body) return response;
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const next = await reader.read();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
        async cancel(reason) {
          chatSpan.setAttribute("opentrip.agent.client_disconnected", true);
          await reader.cancel(reason);
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (err) {
      releasePersistHold();
      chatSpan.recordError(err);
      chatSpan.end();
      throw err;
    }
  }

  /** Record a whitelisted write operation in the session and schedule the
   * AI-judged intervention decision. */
  async recordOperation(
    event: OperationEvent,
    defer: Defer,
    context: AgentExecutionContext = {},
  ): Promise<void> {
    const trip = await this.load(event.tripId);
    const executionContext = {
      ...context,
      turnId: context.turnId ?? newId("turn_"),
    };
    await this.appendMessage(trip, {
      role: "system",
      parts: [{ type: "text", text: event.summary }],
      actorUserId: event.actorUserId,
      source: "operation",
    }, executionContext);
    defer(
      this.evaluateOperation(
        trip,
        event,
        modelObservability("operation", executionContext),
      ),
    );
  }

  /**
   * Mirror a stop comment into the shared agent session when it @mentions
   * members and/or @agent. Member mentions drive the same toast path as chat;
   * ambient reply runs only for explicit @agent and is written back into the
   * stop comment thread (not the agent drawer).
   */
  async recordStopComment(
    tripId: string,
    userId: string,
    text: string,
    stopId: string,
    defer: Defer,
    context: AgentExecutionContext = {},
  ): Promise<void> {
    const trip = await this.load(tripId);
    const parts = buildUserMessageParts(text, trip, userId);
    const wantsAgent = containsAgentMention(text);
    const memberIds = mentionedUserIdsFromParts(parts);
    if (!wantsAgent && memberIds.length === 0) return;
    const executionContext = {
      ...context,
      turnId: context.turnId ?? newId("turn_"),
    };

    await this.appendMessage(trip, {
      role: "user",
      parts,
      actorUserId: userId,
      source: "stop_comment",
    }, executionContext);
    if (wantsAgent) {
      defer(
        this.generateAmbientReply(
          tripId,
          { stopId },
          modelObservability("ambient", executionContext),
        ),
      );
    }
  }

  /** @deprecated Prefer `recordStopComment` — kept as a thin alias. */
  async recordMention(
    tripId: string,
    userId: string,
    text: string,
    defer: Defer,
  ): Promise<void> {
    return this.recordStopComment(tripId, userId, text, "", defer);
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
    return this.observability.startSpan(
      "opentrip.agent.suggestion_response",
      {
        tripId,
        suggestionId: approval.id,
        approved: approval.approved,
      },
      async () => {
        if (!approval.approved) {
          await this.dismissSuggestion(tripId, approval.id, userId);
          return { dismissed: true };
        }
        return this.applySuggestion(tripId, approval.id, userId, approval.reason);
      },
    );
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

    // Echo the in-memory aggregate after apply — do not re-SELECT through
    // Hyperdrive (can omit the just-applied patch for ~60s).
    return toTripDto(trip, userId);
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
    context: AgentExecutionContext = {},
  ): Promise<AgentMessage> {
    const { id, ...rest } = message;
    const messageId = id && id.length > 0 ? id : newId("am");
    const messageText = textFromMessageParts(rest.parts);
    const messageFingerprint = messageText
      ? await fingerprintMessageText(messageText)
      : undefined;
    return this.observability.startSpan(
      "opentrip.agent.persist_message",
      {
        ...context,
        tripId: trip.id,
        messageId,
        source: rest.source,
        messageFingerprint,
      },
      async () => {
        const persisted = await this.sessionRepo.appendMessage({
          id: messageId,
          tripId: trip.id,
          tripVersion: trip.toSnapshot().version,
          ...rest,
        });
        this.observability.logger.info("agent.persist_message", {
          ...context,
          tripId: trip.id,
          messageId: persisted.id,
          messageFingerprint,
          source: persisted.source,
          tripVersion: persisted.tripVersion,
        });
        return persisted;
      },
    );
  }

  private async maybeReplyIfAddressed(
    tripId: string,
    messageText: string,
    observability: AgentObservabilityContext,
  ): Promise<void> {
    const span = this.observability.startTrace("opentrip.agent.addressed_check", {
      tripId,
      turnId: observability.turnId,
      requestId: observability.requestId,
      trigger: observability.trigger,
      runtime: observability.runtime,
    });
    await span.run(async () => {
      try {
        const trip = await this.load(tripId);
        const history = await this.listContextMessages(tripId);
        const streetViewGrounding = await this.streetViewGroundingService.resolve({
          tripId,
          history,
          near: destinationCenterFromTrip(trip.toSnapshot()),
          observability,
        });
        // Deterministic: short confirmations / follow-ups right after an agent
        // turn continue the thread without requiring @agent.
        const addressed =
          streetViewGrounding !== null ||
          looksLikeAgentThreadFollowUp(history, messageText) ||
          (await this.model.isAddressed({
            trip: trip.toSnapshot(),
            history,
            messageText,
            observability,
          }));
        if (!addressed) return;
        await this.generateAmbientReply(
          tripId,
          streetViewGrounding ? { streetViewGrounding } : undefined,
          { ...observability, trigger: "ambient" },
        );
      } catch (err) {
        span.recordError(err);
        this.observability.logger.error("agent.addressed_check_failed", {
          tripId,
          turnId: observability.turnId,
          requestId: observability.requestId,
          runtime: observability.runtime,
          error: err,
        });
        this.observability.captureException(err, {
          tripId,
          turnId: observability.turnId,
          runtime: observability.runtime,
        });
      } finally {
        span.end();
      }
    });
  }

  private async generateAmbientReply(
    tripId: string,
    options?: {
      stopId?: string;
      streetViewGrounding?: AgentStreetViewGrounding;
    },
    observability: AgentObservabilityContext = modelObservability("ambient"),
  ): Promise<void> {
    const span = this.observability.startTrace("opentrip.agent.ambient_reply", {
      tripId,
      turnId: observability.turnId,
      requestId: observability.requestId,
      trigger: observability.trigger,
      runtime: observability.runtime,
    });
    await span.run(async () => {
      try {
        const trip = await this.load(tripId);
        const history = await this.listContextMessages(tripId);
        const streetViewGrounding =
          options?.streetViewGrounding ??
          (await this.streetViewGroundingService.resolve({
            tripId,
            history,
            near: destinationCenterFromTrip(trip.toSnapshot()),
            observability,
          })) ??
          undefined;
        const parts = await this.model.generateReply({
          trip: trip.toSnapshot(),
          history,
          observability,
          streetViewGrounding,
        });
        const stopId = options?.stopId?.trim();
        await this.appendMessage(trip, {
          role: "assistant",
          parts,
          actorUserId: null,
          source: stopId ? "stop_comment" : "threshold",
        }, observability);
        if (stopId) {
          const text = textFromAgentParts(parts);
          if (text) {
            // Reload so we do not overwrite concurrent trip edits with a stale
            // aggregate while the model was generating.
            const fresh = await this.load(tripId);
            fresh.addComment(stopId, AGENT_COMMENT_AUTHOR, text);
            await this.tripRepo.save(fresh);
          }
        }
      } catch (err) {
        span.recordError(err);
        this.observability.logger.error("agent.ambient_reply_failed", {
          tripId,
          turnId: observability.turnId,
          requestId: observability.requestId,
          runtime: observability.runtime,
          error: err,
        });
        this.observability.captureException(err, {
          tripId,
          turnId: observability.turnId,
          runtime: observability.runtime,
        });
      } finally {
        span.end();
      }
    });
  }

  private async evaluateOperation(
    trip: Trip,
    event: OperationEvent,
    observability: AgentObservabilityContext,
  ): Promise<void> {
    const span = this.observability.startTrace("opentrip.agent.operation_evaluation", {
      tripId: event.tripId,
      turnId: observability.turnId,
      requestId: observability.requestId,
      trigger: observability.trigger,
      operationKind: event.operation,
      runtime: observability.runtime,
    });
    await span.run(async () => {
      try {
        const history = await this.listContextMessages(event.tripId);
        const decision = await this.model.evaluateOperation({
          trip: trip.toSnapshot(),
          event,
          history,
          observability,
        });

        if (!decision.shouldNotify) return;

        const notify =
          decision.confidence >= this.options.proactiveThreshold &&
          decision.pendingPatch !== null &&
          getTripOp(decision.pendingPatch.kind)?.allowProactive === true;

        if (!notify) {
          // Quiet context: visible in the session timeline, but no toast.
          await this.appendMessage(trip, {
            role: "system",
            parts: [{ type: "text", text: `Observation: ${decision.reason}` }],
            actorUserId: null,
            source: "operation",
          }, observability);
          return;
        }

        const message = await this.appendMessage(trip, {
          role: "assistant",
          parts: [
            { type: "text", text: `${decision.reason}\n\n${decision.suggestion}` },
          ],
          actorUserId: null,
          source: "threshold",
        }, observability);
        const suggestionId = newId("as");
        await this.sessionRepo.createSuggestion({
          id: suggestionId,
          tripId: event.tripId,
          messageId: message.id,
          severity: decision.severity,
          confidence: decision.confidence,
          reason: decision.reason,
          suggestionText: decision.suggestion,
          patch: decision.pendingPatch!,
          tripVersion: trip.toSnapshot().version,
          expiresAt: decision.expiresInMinutes
            ? new Date(
                Date.now() + decision.expiresInMinutes * 60 * 1000,
              ).toISOString()
            : null,
        });
        this.observability.logger.info("agent.suggestion.created", {
          tripId: event.tripId,
          turnId: observability.turnId,
          messageId: message.id,
          suggestionId,
          tripVersion: trip.toSnapshot().version,
          runtime: observability.runtime,
        });
      } catch (err) {
        span.recordError(err);
        this.observability.logger.error("agent.operation_evaluation_failed", {
          tripId: event.tripId,
          turnId: observability.turnId,
          requestId: observability.requestId,
          runtime: observability.runtime,
          error: err,
        });
        this.observability.captureException(err, {
          tripId: event.tripId,
          turnId: observability.turnId,
          runtime: observability.runtime,
        });
      } finally {
        span.end();
      }
    });
  }

  /** Run the pending patch via the trip ops catalog (domain + repository). */
  private applyPatch(trip: Trip, patch: PendingPatch, actorUserId: string) {
    const versionBefore = trip.toSnapshot().version;
    return this.observability.startSpan(
      "opentrip.trip.operation.apply",
      {
        tripId: trip.id,
        operationKind: patch.kind,
        tripVersionBefore: versionBefore,
      },
      async (span) => {
        const result = await applyTripOp(
          {
            trip,
            actorUserId,
            tripRepo: this.tripRepo,
            tripChangePublisher: this.tripChangePublisher,
          },
          patch,
        );
        span.setAttribute("opentrip.trip.version_after", trip.toSnapshot().version);
        span.setAttribute("opentrip.operation.ok", result.ok);
        return result;
      },
    );
  }
}
