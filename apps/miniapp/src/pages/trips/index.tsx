import { useCallback, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import {
  mergeTripSummaries,
  toTripSummary,
  type TripSummary,
} from "@/entities/trip";
import { ApiError, createTrip, fetchTrips, signOut } from "@/shared/api";
import { getAuthToken } from "@/shared/auth";
import { copy } from "@/shared/config";
import { StatePanel } from "@/shared/ui/state-panel";
import { getTripEchoes, recordTripEcho } from "./model/trip-echo";
import { TripCard } from "./ui/TripCard";
import "./page.css";

export default function TripsPage() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [dayCount, setDayCount] = useState("3");
  const [creating, setCreating] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getAuthToken()) {
      await Taro.reLaunch({ url: "/pages/auth/index" });
      return;
    }
    setError(null);
    try {
      const fetched = await fetchTrips();
      setTrips(mergeTripSummaries(fetched, getTripEchoes()));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await Taro.reLaunch({ url: "/pages/auth/index" });
        return;
      }
      setError(caught instanceof Error ? caught.message : copy.trips.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  const submitCreate = async () => {
    const normalizedTitle = title.trim();
    const parsedDayCount = Number(dayCount);
    if (
      !normalizedTitle ||
      !Number.isInteger(parsedDayCount) ||
      parsedDayCount < 1 ||
      parsedDayCount > 60
    ) {
      setCreateError(copy.trips.createInvalid);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const trip = await createTrip({
        title: normalizedTitle,
        destination: destination.trim() || undefined,
        dayCount: parsedDayCount,
      });
      const summary = toTripSummary(trip, new Date().toISOString());
      recordTripEcho(summary);
      setTrips((current) => mergeTripSummaries(current, [summary]));
      setCreateOpen(false);
      setTitle("");
      setDestination("");
      await Taro.navigateTo({
        url: `/pages/trip-detail/index?id=${encodeURIComponent(trip.id)}`,
      });
    } catch (caught) {
      setCreateError(
        caught instanceof Error ? caught.message : copy.common.unknownError,
      );
    } finally {
      setCreating(false);
    }
  };

  const submitSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      await Taro.reLaunch({ url: "/pages/auth/index" });
      setSigningOut(false);
    }
  };

  return (
    <View className="page-shell trips-page">
      <View className="trips-header">
        <View className="trips-header__copy">
          <Text className="trips-header__title">{copy.trips.title}</Text>
          <Text className="trips-header__subtitle">{copy.trips.subtitle}</Text>
        </View>
        <View className="trips-header__actions">
          <Button
            className="trips-header__sign-out"
            disabled={signingOut}
            onClick={() => void submitSignOut()}
          >
            {signingOut ? copy.trips.signingOut : copy.trips.signOut}
          </Button>
          <Button
            className="secondary-button trips-header__button"
            onClick={() => setCreateOpen((open) => !open)}
          >
            {createOpen ? copy.trips.closeCreate : copy.trips.create}
          </Button>
        </View>
      </View>

      {createOpen ? (
        <View className="card create-card">
          <Text className="create-card__label">{copy.trips.titleField}</Text>
          <Input
            className="field"
            value={title}
            placeholder={copy.trips.titlePlaceholder}
            onInput={(event) => setTitle(event.detail.value)}
          />
          <Text className="create-card__label">{copy.trips.destinationField}</Text>
          <Input
            className="field"
            value={destination}
            placeholder={copy.trips.destinationPlaceholder}
            onInput={(event) => setDestination(event.detail.value)}
          />
          <Text className="create-card__label">{copy.trips.dayCountField}</Text>
          <Input
            className="field"
            type="number"
            value={dayCount}
            onInput={(event) => setDayCount(event.detail.value)}
          />
          {createError ? <Text className="error-copy">{createError}</Text> : null}
          <Button
            className="primary-button"
            disabled={creating}
            onClick={() => void submitCreate()}
          >
            {creating ? copy.trips.creating : copy.trips.createSubmit}
          </Button>
        </View>
      ) : null}

      {loading ? (
        <StatePanel message={copy.common.loading} />
      ) : error ? (
        <StatePanel
          message={error}
          actionLabel={copy.common.retry}
          onAction={() => void load()}
        />
      ) : trips.length === 0 ? (
        <StatePanel
          message={copy.trips.empty}
          actionLabel={copy.trips.create}
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <View className="trips-list">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onOpen={() =>
                void Taro.navigateTo({
                  url: `/pages/trip-detail/index?id=${encodeURIComponent(trip.id)}`,
                })
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}
