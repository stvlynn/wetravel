import { NotFoundError } from "../domain/shared/errors";
import type { CoverImageProvider } from "../domain/cover";
import {
  Trip,
  type AddExpenseDraft,
  type CreateTripDraft,
  type InsertStopDraft,
  type MoveStopDraft,
  type TripOwner,
  type TripRepository,
  type TripSummary,
  type UpdateDayDraft,
  type UpdateStopDraft,
} from "../domain/trip";
import { toTripDto, type TripDto } from "./dto";
import type { GeoService } from "./geo/geo-service";

/** Thrown when a user tries to act on a trip they cannot access or mutate. */
export class ForbiddenError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Read-side and command use cases for the Trip aggregate. Every method takes
 * the acting user id so access and mutation permissions can be enforced. */
export class TripService {
  constructor(
    private repo: TripRepository,
    private coverImages: CoverImageProvider | null = null,
    private geo: GeoService | null = null,
  ) {}

  private async load(tripId: string): Promise<Trip> {
    const trip = await this.repo.findById(tripId);
    if (!trip) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    return trip;
  }

  /** Load a trip the user is allowed to read, else 404 (do not leak existence). */
  private async loadReadable(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.load(tripId);
    if (!trip.permissionsFor(userId).isMember) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    return trip;
  }

  /** Load a trip the user may mutate, else 403 for read-only members. */
  private async loadEditable(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.load(tripId);
    const perms = trip.permissionsFor(userId);
    if (!perms.isMember) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    if (!perms.canEdit) {
      throw new ForbiddenError(
        "insufficient_permissions",
        "You do not have permission to edit this trip",
      );
    }
    return trip;
  }

  /** Assert the user may mutate the trip (used by media uploads and similar). */
  async assertEditable(tripId: string, userId: string): Promise<void> {
    await this.loadEditable(tripId, userId);
  }

  listTrips(userId: string): Promise<TripSummary[]> {
    return this.repo.findSummaries(userId);
  }

  async createTrip(draft: CreateTripDraft, owner: TripOwner): Promise<TripDto> {
    const destination = draft.destination?.trim();
    const coverUrl =
      destination && this.coverImages
        ? await this.coverImages.searchLandscape(destination)
        : null;

    let destinationLat: number | undefined;
    let destinationLng: number | undefined;
    if (destination && this.geo && destination.length >= 2) {
      try {
        const places = await this.geo.placeSearch({
          query: destination,
          limit: 1,
        });
        const first = places[0];
        if (first) {
          destinationLat = first.lat;
          destinationLng = first.lng;
        }
      } catch {
        // Geo is best-effort; trip create must not fail when search is down.
      }
    }

    const trip = Trip.create(
      { ...draft, coverUrl, destinationLat, destinationLng },
      owner,
    );
    await this.repo.create(trip);
    return toTripDto(trip, owner.id);
  }

  async renameTrip(
    tripId: string,
    title: string,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.rename(title);
    await this.repo.rename(tripId, trip.toSnapshot().title);
    return toTripDto(trip, userId);
  }

  /** Clear the one-shot agent seed flag after the planner sends the first message. */
  async clearAgentSeedPending(
    tripId: string,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    if (trip.toSnapshot().agentSeedPending) {
      trip.clearAgentSeedPending();
      await this.repo.clearAgentSeedPending(tripId);
    }
    return toTripDto(trip, userId);
  }

  async addDay(tripId: string, userId: string): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    const day = trip.addDay();
    await this.repo.addDay(tripId, day);
    return toTripDto(trip, userId);
  }

  async updateDay(
    tripId: string,
    dayNumber: number,
    draft: UpdateDayDraft,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    const day = trip.updateDay(dayNumber, draft);
    await this.repo.updateDay(tripId, day);
    return toTripDto(trip, userId);
  }

  async reorderDays(
    tripId: string,
    order: number[],
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.reorderDays(order);
    await this.repo.reorderDays(trip);
    return toTripDto(trip, userId);
  }

  async deleteDay(
    tripId: string,
    dayNumber: number,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.deleteDay(dayNumber);
    await this.repo.deleteDay(trip);
    return toTripDto(trip, userId);
  }

  async getTrip(tripId: string, userId: string): Promise<TripDto> {
    const trip = await this.loadReadable(tripId, userId);
    await this.ensureDestinationCenter(trip);
    return toTripDto(trip, userId);
  }

  /** Backfill intake.destinationLat/Lng for older trips that only stored a label. */
  private async ensureDestinationCenter(trip: Trip): Promise<void> {
    if (!this.geo) return;
    const intake = trip.toSnapshot().intake;
    const destination = intake?.destination?.trim();
    if (!destination || destination.length < 2) return;
    if (
      typeof intake?.destinationLat === "number" &&
      typeof intake?.destinationLng === "number"
    ) {
      return;
    }
    try {
      const places = await this.geo.placeSearch({
        query: destination,
        limit: 1,
      });
      const first = places[0];
      if (!first) return;
      if (!trip.setDestinationCenter(first.lat, first.lng)) return;
      await this.repo.updateIntake(trip.toSnapshot().id, trip.toSnapshot().intake);
    } catch {
      // Best-effort; map can still Photon-geocode on the client.
    }
  }

  async insertStop(
    tripId: string,
    draft: InsertStopDraft,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.insertStop(draft, trip.actingMemberId(userId));
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }

  async updateStop(
    tripId: string,
    stopId: string,
    draft: UpdateStopDraft,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.updateStop(stopId, draft);
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }

  async moveStop(
    tripId: string,
    draft: MoveStopDraft,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.moveStop(draft);
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }

  async toggleVote(
    tripId: string,
    stopId: string,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.toggleVote(stopId, trip.actingMemberId(userId));
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }

  async addComment(
    tripId: string,
    stopId: string,
    text: string,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.addComment(stopId, trip.actingMemberId(userId), text);
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }

  async addExpense(
    tripId: string,
    draft: AddExpenseDraft,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.addExpense(draft);
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }

  async updateExpense(
    tripId: string,
    expenseId: string,
    draft: AddExpenseDraft,
    userId: string,
  ): Promise<TripDto> {
    const trip = await this.loadEditable(tripId, userId);
    trip.updateExpense(expenseId, draft);
    await this.repo.save(trip);
    return toTripDto(trip, userId);
  }
}
