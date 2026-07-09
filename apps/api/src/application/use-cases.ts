import { NotFoundError } from "../domain/shared/errors";
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
  constructor(private repo: TripRepository) {}

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
    const trip = Trip.create(draft, owner);
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
    return toTripDto(await this.loadReadable(tripId, userId), userId);
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
