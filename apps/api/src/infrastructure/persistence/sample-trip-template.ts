import { Trip, type TripRepository } from "../../domain/trip";
import { SAMPLE_TRIP_ID } from "../../application/user/provision-sample-trip";
import { seedTrips } from "./seed-data";

/** Resolve the sample trip used to onboard new users.
 *
 * Prefers the live `japan-2025` row so onboarding matches the seeded DB;
 * falls back to the in-memory seed snapshot when that row is missing. */
export function createSampleTripTemplateLoader(
  repo: TripRepository,
): () => Promise<Trip> {
  return async () => {
    const fromDb = await repo.findById(SAMPLE_TRIP_ID);
    if (fromDb) return fromDb;

    const seed = seedTrips()[0];
    if (!seed) {
      throw new Error("No sample trip template available");
    }
    return Trip.fromSnapshot(structuredClone(seed.snapshot));
  };
}
