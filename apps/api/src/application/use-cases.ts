import { NotFoundError } from "../domain/shared/errors";
import {
  Trip,
  type AddExpenseDraft,
  type CreateTripDraft,
  type InsertStopDraft,
  type TripOwner,
  type TripRepository,
  type TripSummary,
} from "../domain/trip";
import { toTripDto, type TripDto } from "./dto";

async function load(repo: TripRepository, tripId: string) {
  const trip = await repo.findById(tripId);
  if (!trip) throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
  return trip;
}

/** Read-side and command use cases for the Trip aggregate. */
export class TripService {
  constructor(private repo: TripRepository) {}

  listTrips(): Promise<TripSummary[]> {
    return this.repo.findSummaries();
  }

  async createTrip(draft: CreateTripDraft, owner: TripOwner): Promise<TripDto> {
    const trip = Trip.create(draft, owner);
    await this.repo.create(trip);
    return toTripDto(trip);
  }

  async renameTrip(tripId: string, title: string): Promise<TripDto> {
    const trip = await load(this.repo, tripId);
    trip.rename(title);
    await this.repo.rename(tripId, trip.toSnapshot().title);
    return toTripDto(trip);
  }

  async addDay(tripId: string): Promise<TripDto> {
    const trip = await load(this.repo, tripId);
    const day = trip.addDay();
    await this.repo.addDay(tripId, day);
    return toTripDto(trip);
  }

  async getTrip(tripId: string): Promise<TripDto> {
    return toTripDto(await load(this.repo, tripId));
  }

  async insertStop(tripId: string, draft: InsertStopDraft): Promise<TripDto> {
    const trip = await load(this.repo, tripId);
    trip.insertStop(draft, trip.currentMemberId());
    await this.repo.save(trip);
    return toTripDto(trip);
  }

  async toggleVote(tripId: string, stopId: string): Promise<TripDto> {
    const trip = await load(this.repo, tripId);
    trip.toggleVote(stopId, trip.currentMemberId());
    await this.repo.save(trip);
    return toTripDto(trip);
  }

  async addComment(tripId: string, stopId: string, text: string): Promise<TripDto> {
    const trip = await load(this.repo, tripId);
    trip.addComment(stopId, trip.currentMemberId(), text);
    await this.repo.save(trip);
    return toTripDto(trip);
  }

  async addExpense(tripId: string, draft: AddExpenseDraft): Promise<TripDto> {
    const trip = await load(this.repo, tripId);
    trip.addExpense(draft);
    await this.repo.save(trip);
    return toTripDto(trip);
  }
}
