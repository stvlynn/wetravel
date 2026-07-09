import { Trip, type TripOwner, type TripRepository } from "../../domain/trip";

/** Canonical id of the shared demo trip loaded by `prisma/seed.ts`. */
export const SAMPLE_TRIP_ID = "japan-2025";

export interface ProvisionSampleTripUser {
  id: string;
  name: string;
  image?: string | null;
}

/** Load the sample trip template (DB row or in-memory seed fallback). */
export type SampleTripTemplateLoader = () => Promise<Trip>;

/** Give a newly registered user their own copy of the sample Japan trip.
 *
 * Failures are logged and swallowed so a provisioning error never blocks
 * sign-up. */
export async function provisionSampleTripForUser(
  repo: TripRepository,
  user: ProvisionSampleTripUser,
  loadTemplate: SampleTripTemplateLoader,
): Promise<Trip | null> {
  try {
    const template = await loadTemplate();
    const owner: TripOwner = {
      id: user.id,
      name: user.name.trim() || "Traveler",
      image: user.image ?? null,
    };
    const trip = Trip.cloneFromTemplate(template, owner);
    await repo.create(trip);
    await repo.save(trip);
    return trip;
  } catch (err) {
    console.error("[provision-sample-trip] failed for user", user.id, err);
    return null;
  }
}
