import Taro from "@tarojs/taro";
import type { TripSummary } from "@/entities/trip";

const STORAGE_KEY = "opentrip.trip-write-echoes";
const ECHO_TTL_MS = 60_000;

interface StoredEcho {
  expiresAt: number;
  trip: TripSummary;
}

function readEchoes(now = Date.now()): StoredEcho[] {
  const value: unknown = Taro.getStorageSync(STORAGE_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is StoredEcho =>
      typeof item === "object" &&
      item !== null &&
      "expiresAt" in item &&
      typeof item.expiresAt === "number" &&
      item.expiresAt > now &&
      "trip" in item,
  );
}

export function getTripEchoes(): TripSummary[] {
  const echoes = readEchoes();
  Taro.setStorageSync(STORAGE_KEY, echoes);
  return echoes.map(({ trip }) => trip);
}

export function recordTripEcho(trip: TripSummary): void {
  const echoes = readEchoes().filter((entry) => entry.trip.id !== trip.id);
  echoes.push({ trip, expiresAt: Date.now() + ECHO_TTL_MS });
  Taro.setStorageSync(STORAGE_KEY, echoes);
}
