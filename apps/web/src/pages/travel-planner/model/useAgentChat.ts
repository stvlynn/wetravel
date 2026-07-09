import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { fetchAgentMessages, postAgentMessage } from "@/shared/api";
import { config, queryKeys } from "@/shared/config";

const MENTION_PATTERN = /@agent\b/i;

function hasPendingToolApproval(messages: UIMessage[]): boolean {
  return messages.some((m) =>
    m.parts.some(
      (p) =>
        isToolUIPart(p) &&
        p.state === "approval-requested" &&
        !p.approval?.isAutomatic,
    ),
  );
}

/** Shared-session chat for the agent panel.
 *
 * Persisted history lives in a React Query cache (shared across members via
 * polling); `useChat` is only the streaming buffer for replies this client
 * explicitly requested with an @agent mention, including AI SDK tool-approval
 * turns. Once a stream settles and no tool is waiting on the user, the history
 * is refetched and the buffer cleared so nothing renders twice. */
export function useAgentChat(tripId: string, enabled: boolean) {
  const queryClient = useQueryClient();

  const history = useQuery({
    queryKey: queryKeys.agentMessages(tripId),
    queryFn: () => fetchAgentMessages(tripId),
    enabled,
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${config.baseUrl}/api/trips/${tripId}/agent/chat`,
        credentials: "include",
        // Send the full live turn so approval-responded parts reach the server
        // (AI SDK convertToModelMessages + tool execute).
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages },
        }),
      }),
    [tripId],
  );

  const chat = useChat({
    id: `trip-agent-${tripId}`,
    transport,
    // After the user approves/denies tools, auto-continue the stream so execute runs.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const { status, messages: liveMessages, setMessages } = chat;
  const settledRef = useRef(false);
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      settledRef.current = true;
      return;
    }
    if (!settledRef.current || liveMessages.length === 0) return;
    // Keep the live buffer while a write tool is waiting for Approve/Deny.
    if (hasPendingToolApproval(liveMessages)) return;
    settledRef.current = false;
    void queryClient
      .invalidateQueries({ queryKey: queryKeys.agentMessages(tripId) })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
        setMessages([]);
      });
  }, [status, liveMessages, queryClient, tripId, setMessages]);

  /** Route input: @agent mentions stream a reply; plain messages land in the
   * shared session and the server decides whether the agent was addressed
   * (ambient replies arrive via polling). */
  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (MENTION_PATTERN.test(trimmed)) {
      await chat.sendMessage({ text: trimmed });
    } else {
      await postAgentMessage(tripId, trimmed);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agentMessages(tripId),
      });
    }
  };

  return {
    history: history.data,
    historyPending: history.isPending,
    liveMessages: chat.messages,
    streaming: status === "streaming" || status === "submitted",
    error: chat.error,
    send,
    addToolApprovalResponse: chat.addToolApprovalResponse,
  };
}
