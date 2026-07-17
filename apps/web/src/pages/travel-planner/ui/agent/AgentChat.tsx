import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/entities/trip";
import { clearAgentSeedPending, type AgentSuggestion } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { Spinner } from "@/shared/ui/spinner";
import { useAgentChat } from "../../model/useAgentChat";
import { buildAgentSeedMessage } from "../../lib/buildAgentSeedMessage";
import type { AgentUIMessage } from "../../model/agent-ui-message";
import { type QuoteTarget } from "../quote";
import { AgentComposer } from "./AgentComposer";
import {
  AgentMessageItem,
  textFromParts,
  type AgentDisplayMessage,
} from "./AgentMessage";

function seedGuardKey(tripId: string): string {
  return `wf.agentSeed.${tripId}`;
}

/** Message list + sticky input for the shared trip session. */
export function AgentChat({
  tripId,
  trip,
  canEdit,
  applyingId,
  enabled = true,
  onApproveSuggestion,
  onDenySuggestion,
  onFocusDay,
  onFocusStop,
}: {
  tripId: string;
  trip: Trip;
  canEdit: boolean;
  applyingId: string | null;
  /** Gate history polling while the panel is collapsed. */
  enabled?: boolean;
  onApproveSuggestion: (suggestion: AgentSuggestion) => void;
  onDenySuggestion: (suggestion: AgentSuggestion) => void;
  onFocusDay: (dayNumber: number) => void;
  onFocusStop: (stopId: string) => void;
}) {
  const { t } = useTranslation("agent");
  const queryClient = useQueryClient();
  const {
    history,
    historyPending,
    liveMessages,
    streaming,
    send,
    addToolApprovalResponse,
    streamDebug,
  } = useAgentChat(tripId, enabled);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [quote, setQuote] = useState<QuoteTarget | null>(null);
  const seedingRef = useRef(false);

  const persisted: AgentDisplayMessage[] = (history?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n"),
    actorUserId: m.actorUserId,
    actorName: m.actorName,
    source: m.source,
    createdAt: m.createdAt,
    parts: m.parts as AgentUIMessage["parts"],
  }));

  // Live streaming buffer: only messages not yet in shared history. Server
  // persists chat turns with the same UIMessage ids as useChat, so this
  // filter drops the live bubble as soon as polling/refetch lands the row
  // (avoids Steven + "系统" duplicates while the stream is still open).
  const persistedIds = new Set(persisted.map((m) => m.id));
  const currentMember = trip.members.find((m) => m.isCurrentUser);
  const live: AgentDisplayMessage[] = liveMessages
    .filter((m) => !persistedIds.has(m.id))
    .map((m) => ({
      id: m.id,
      role: m.role as AgentDisplayMessage["role"],
      // Keep flattened text for stop-context parsing / system fallbacks, but
      // AgentMessageItem prefers `parts` so text/reasoning deltas re-render.
      text: textFromParts(m.parts),
      // useChat has no actor metadata — stamp the current member so the
      // header shows their name instead of falling back to "系统".
      actorUserId: currentMember?.userId ?? null,
      actorName: currentMember?.name ?? null,
      source: "chat" as const,
      createdAt: null,
      parts: m.parts,
      streaming: streaming && m.role === "assistant",
      debugRequestId: streamDebug.requestId,
      debugTurnId: streamDebug.turnId,
    }));

  // Stop-comment @agent threads live in StopDetail; keep them out of the drawer.
  const messages = [...persisted, ...live].filter(
    (m) => m.source !== "stop_comment",
  );
  const suggestionsByMessage = new Map(
    (history?.suggestions ?? [])
      .filter((s) => s.messageId)
      .map((s) => [s.messageId!, s] as const),
  );

  // One-shot wizard seed: open panel + empty history + pending flag.
  useEffect(() => {
    if (!enabled || historyPending || seedingRef.current) return;
    if (!trip.agentSeedPending) return;
    if (messages.length > 0) return;

    const text = buildAgentSeedMessage(t, trip.intake);
    if (!text) return;

    if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(seedGuardKey(tripId))) return;
      sessionStorage.setItem(seedGuardKey(tripId), "1");
    }
    seedingRef.current = true;

    void (async () => {
      try {
        await send(text, []);
        const updated = await clearAgentSeedPending(tripId);
        queryClient.setQueryData(queryKeys.trip(tripId), updated);
      } catch {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(seedGuardKey(tripId));
        }
        seedingRef.current = false;
      }
    })();
  }, [
    enabled,
    historyPending,
    messages.length,
    queryClient,
    send,
    t,
    trip.agentSeedPending,
    trip.intake,
    tripId,
  ]);

  // Follow both new messages and in-place part growth during streaming
  // (text deltas and DeepSeek reasoning deltas).
  const streamFingerprint = live
    .map((m) => {
      const partLens = (m.parts ?? [])
        .map((p) =>
          "text" in p && typeof p.text === "string" ? p.text.length : 0,
        )
        .join(",");
      return `${m.id}:${partLens}`;
    })
    .join("|");
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streaming, streamFingerprint]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="scrollbar-overlay flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3"
      >
        {historyPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-4" />
          </div>
        ) : messages.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-pretty text-muted-foreground">
            {t("panel.empty")}
          </p>
        ) : (
          messages.map((m) => (
            <AgentMessageItem
              key={m.id}
              message={m}
              trip={trip}
              suggestion={suggestionsByMessage.get(m.id)}
              canEdit={canEdit}
              applying={applyingId === suggestionsByMessage.get(m.id)?.id}
              onApproveSuggestion={onApproveSuggestion}
              onDenySuggestion={onDenySuggestion}
              onToolApprove={(id) =>
                void addToolApprovalResponse({ id, approved: true })
              }
              onToolDeny={(id) =>
                void addToolApprovalResponse({ id, approved: false })
              }
              onGeneratedFollowUp={(message) => send(message, [])}
              onGeneratedFocusDay={onFocusDay}
              onGeneratedFocusStop={onFocusStop}
              onReply={(target) => setQuote(target)}
            />
          ))
        )}
        {streaming && live.every((m) => m.role !== "assistant") ? (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            <span>{t("panel.thinking")}</span>
          </div>
        ) : null}
      </div>

      <AgentComposer
        trip={trip}
        onSend={send}
        quote={quote}
        onClearQuote={() => setQuote(null)}
      />
    </div>
  );
}
