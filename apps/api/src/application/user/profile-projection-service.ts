import {
  createTripChange,
  type TripChangePublisher,
} from "../../domain/realtime";
export interface MemberProfileUpdate {
  name?: string;
  image?: string | null;
}

export interface SyncedMemberTrip {
  tripId: string;
  revision: number;
}

export interface MemberProfileProjection {
  syncMemberProfile(
    userId: string,
    profile: MemberProfileUpdate,
  ): Promise<SyncedMemberTrip[]>;
}

export function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 64) {
    throw new UserProfileValidationError(
      "Display name must be between 1 and 64 characters",
    );
  }
  return name;
}

export class UserProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserProfileValidationError";
  }
}

/** Keeps denormalized trip-member display data aligned with Better Auth users. */
export class UserProfileProjectionService {
  constructor(
    private readonly trips: MemberProfileProjection,
    private readonly changes: TripChangePublisher | null = null,
  ) {}

  async synchronize(
    userId: string,
    profile: MemberProfileUpdate,
  ): Promise<void> {
    const synced = await this.trips.syncMemberProfile(userId, profile);
    if (!this.changes) return;

    await Promise.all(
      synced.map(async ({ tripId, revision }) => {
        try {
          await this.changes!.publish(
            createTripChange({
              eventId: crypto.randomUUID(),
              tripId,
              revision,
              actorId: userId,
              occurredAt: new Date().toISOString(),
              scopes: ["members"],
            }),
          );
        } catch (error) {
          // The committed profile projection remains authoritative; realtime
          // notification is best-effort and clients recover on their next read.
          console.error("Failed to publish user profile member change", {
            tripId,
            revision,
            error,
          });
        }
      }),
    );
  }
}
