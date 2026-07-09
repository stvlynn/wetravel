import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAgentEvents, type AgentMessage, type AgentSuggestion } from "@/shared/api";
import { queryKeys } from "@/shared/config";

const POLL_INTERVAL_MS = 12_000;

/** Poll the shared agent session so every online member sees new messages and
 * intervention suggestions. Returns suggestions plus the latest polled message
 * batch (empty on the first cursor sync) for mention toasts. */
export function useAgentEvents(
  tripId: string,
  enabled: boolean,
): { suggestions: AgentSuggestion[]; newMessages: AgentMessage[] } {
  const queryClient = useQueryClient();
  const lastSeqRef = useRef(-1);
  const [newMessages, setNewMessages] = useState<AgentMessage[]>([]);

  const { data } = useQuery({
    queryKey: queryKeys.agentEvents(tripId),
    queryFn: () => fetchAgentEvents(tripId, Math.max(lastSeqRef.current, 0)),
    refetchInterval: POLL_INTERVAL_MS,
    enabled,
  });

  useEffect(() => {
    if (!data) return;
    const first = lastSeqRef.current === -1;
    if (data.latestSeq > lastSeqRef.current) {
      const batch = first ? [] : data.messages;
      lastSeqRef.current = data.latestSeq;
      setNewMessages(batch);
      if (!first && batch.length > 0) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.agentMessages(tripId),
        });
      }
    }
  }, [data, queryClient, tripId]);

  return {
    suggestions: data?.suggestions ?? [],
    newMessages,
  };
}
