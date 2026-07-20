import { useCallback, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { stopsForDay, type Trip } from "@/entities/trip";
import { ApiError, fetchTrip, toggleVote } from "@/shared/api";
import { copy } from "@/shared/config";
import { StatePanel } from "@/shared/ui/state-panel";
import "./page.css";

export default function TripDetailPage() {
  const router = useRouter();
  const tripId = String(router.params.id ?? "");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votingStopId, setVotingStopId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tripId) {
      setError(copy.detail.loadError);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setTrip(await fetchTrip(tripId));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await Taro.reLaunch({ url: "/pages/auth/index" });
        return;
      }
      setError(caught instanceof Error ? caught.message : copy.detail.loadError);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  const vote = async (stopId: string) => {
    if (!trip) return;
    setVotingStopId(stopId);
    try {
      setTrip(await toggleVote(trip.id, stopId));
    } catch (caught) {
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : copy.common.unknownError,
        icon: "none",
      });
    } finally {
      setVotingStopId(null);
    }
  };

  if (loading) return <StatePanel message={copy.common.loading} />;
  if (error || !trip) {
    return (
      <StatePanel
        message={error ?? copy.detail.loadError}
        actionLabel={copy.common.retry}
        onAction={() => void load()}
      />
    );
  }

  return (
    <View className="page-shell detail-page">
      <View className="card detail-hero">
        {trip.coverUrl ? (
          <Image className="detail-hero__image" src={trip.coverUrl} mode="aspectFill" />
        ) : null}
        <View className="detail-hero__body">
          <Text className="detail-hero__title">{trip.title}</Text>
          <Text className="detail-hero__meta">
            {trip.members.length}{copy.trips.members} · {trip.stops.length}{copy.trips.stops}
          </Text>
        </View>
      </View>

      {trip.days.map((day) => {
        const stops = stopsForDay(trip.stops, day.number);
        return (
          <View className="day-section" key={day.number}>
            <View className="day-section__header">
              <View className="day-section__dot" style={{ backgroundColor: day.color }} />
              <View className="day-section__heading">
                <Text className="day-section__title">
                  {copy.detail.dayPrefix}{day.number}{copy.detail.daySuffix}
                </Text>
                <Text className="day-section__subtitle">
                  {day.city || day.date || day.dateLabel || copy.detail.destinationPending}
                </Text>
              </View>
            </View>

            {stops.length === 0 ? (
              <View className="card day-empty">{copy.detail.emptyDay}</View>
            ) : (
              <View className="day-stops">
                {stops.map((stop) => (
                  <View className="card stop-card" key={stop.id}>
                    <View className="stop-card__time">
                      <Text>{stop.time || "—"}</Text>
                      <Text className="stop-card__duration">{stop.duration}</Text>
                    </View>
                    <View className="stop-card__body">
                      <Text className="stop-card__name">{stop.name}</Text>
                      <Text className="stop-card__area">
                        {stop.area || stop.category}
                      </Text>
                    </View>
                    <Button
                      className="stop-card__vote"
                      disabled={!trip.permissions.canEdit || votingStopId === stop.id}
                      onClick={() => void vote(stop.id)}
                    >
                      {votingStopId === stop.id ? copy.detail.voting : `${copy.detail.vote} ${stop.votes.length}`}
                    </Button>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
