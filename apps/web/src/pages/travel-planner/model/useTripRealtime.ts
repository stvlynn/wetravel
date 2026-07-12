import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/entities/trip";
import {
  TripRealtimeClient,
  type RealtimeConnectionStatus,
  type RealtimePresenceMember,
  type TripChangeMessage,
} from "@/shared/api";
import { queryKeys } from "@/shared/config";

export function useTripRealtime(tripId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const [status, setStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const [presence, setPresence] = useState<RealtimePresenceMember[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const resync = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips });
    };
    const client = new TripRealtimeClient({
      tripId,
      onStatus: setStatus,
      onPresence: setPresence,
      onResync: resync,
      onChange: (change: TripChangeMessage) => {
        if (change.tripId !== tripId) return;
        if (change.scopes.includes("reservations")) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.reservations(tripId),
          });
        }
        const cached = queryClient.getQueryData<Trip>(queryKeys.trip(tripId));
        if (cached && change.revision <= cached.version) return;
        resync();
      },
    });
    client.start();
    return () => client.stop();
  }, [enabled, queryClient, tripId]);

  return { status, presence };
}
