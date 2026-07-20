import { Image, Text, View } from "@tarojs/components";
import type { TripSummary } from "@/entities/trip";
import { copy } from "@/shared/config";

interface TripCardProps {
  trip: TripSummary;
  onOpen: () => void;
}

export function TripCard({ trip, onOpen }: TripCardProps) {
  return (
    <View className="card trip-card" onClick={onOpen}>
      {trip.coverUrl ? (
        <Image className="trip-card__cover" src={trip.coverUrl} mode="aspectFill" />
      ) : (
        <View
          className="trip-card__cover trip-card__cover--fallback"
          style={{ backgroundColor: trip.coverColor }}
        >
          <Text className="trip-card__route">↗</Text>
        </View>
      )}
      <View className="trip-card__body">
        <Text className="trip-card__title">{trip.title}</Text>
        <Text className="trip-card__date">
          {[trip.startLabel, trip.endLabel].filter(Boolean).join(" – ")}
        </Text>
        <View className="trip-card__meta">
          <Text>{trip.memberCount}{copy.trips.members}</Text>
          <Text>{trip.stopCount}{copy.trips.stops}</Text>
        </View>
      </View>
    </View>
  );
}
