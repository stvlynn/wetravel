import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UIMessage } from "ai";
import type { Trip } from "@/entities/trip";
import type { AgentSuggestion } from "@/shared/api";
import { Spinner } from "@/shared/ui/spinner";
import { useAgentChat } from "../../model/useAgentChat";
import { AgentComposer } from "./AgentComposer";
import {
  AgentMessageItem,
  textFromParts,
  type AgentDisplayMessage,
} from "./AgentMessage";

/** Message list + sticky input for the shared trip session. */
export function AgentChat({
  tripId,
  trip,
  canEdit,
  applyingId,
  enabled = true,
  onApproveSuggestion,
  onDenySuggestion,
}: {
  tripId: string;
  trip: Trip;
  canEdit: boolean;
  applyingId: string | null;
  /** Gate history polling while the panel is collapsed. */
  enabled?: boolean;
  onApproveSuggestion: (suggestion: AgentSuggestion) => void;
  onDenySuggestion: (suggestion: AgentSuggestion) => void;
}) {
  const { t } = useTranslation("agent");
  const {
    history,
    historyPending,
    liveMessages,
    streaming,
    send,
    addToolApprovalResponse,
  } = useAgentChat(tripId, enabled);
  const scrollRef = useRef<HTMLDivElement>(null);

  const persisted: AgentDisplayMessage[] = (history?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n"),
    actorName: m.actorName,
    source: m.source,
    createdAt: m.createdAt,
    parts: m.parts as UIMessage["parts"],
  }));

  // Live streaming buffer: only messages not yet in shared history. Server
  // persists chat turns with the same UIMessage ids as useChat, so this
  // filter drops the live bubble as soon as polling/refetch lands the row
  // (avoids Steven + "系统" duplicates while the stream is still open).
  const persistedIds = new Set(persisted.map((m) => m.id));
  const live: AgentDisplayMessage[] = liveMessages
    .filter((m) => !persistedIds.has(m.id))
    .map((m) => ({
      id: m.id,
      role: m.role as AgentDisplayMessage["role"],
      // Keep flattened text for stop-context parsing / system fallbacks, but
      // AgentMessageItem prefers `parts` so text/reasoning deltas re-render.
      text: textFromParts(m.parts),
      actorName: null,
      source: "chat" as const,
      createdAt: null,
      parts: m.parts,
      streaming: streaming && m.role === "assistant",
    }));

  const messages = [...persisted, ...live];
  const suggestionsByMessage = new Map(
    (history?.suggestions ?? [])
      .filter((s) => s.messageId)
      .map((s) => [s.messageId!, s] as const),
  );

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

      <AgentComposer trip={trip} onSend={send} />
    </div>
  );
}
