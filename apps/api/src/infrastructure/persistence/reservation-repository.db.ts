import {
  Reservation,
  type ReservationRepository,
  type ReservationSnapshot,
  type ReservationStatus,
  type ReservationType,
  type ReservationWriteResult,
} from "../../domain/reservation";
import { createDialect, type SqlClient, type SqlConnection } from "./sql";

interface ReservationRow {
  id: string; trip_id: string; type: string; status: string; title: string;
  provider: string; confirmation_number: string; start_at: string | Date;
  end_at: string | Date | null; timezone: string; location_name: string;
  address: string; latitude: number | string | null;
  longitude: number | string | null; day_number: number | string | null;
  stop_id: string | null; expense_id: string | null;
  amount_minor: number | string | null; currency: string | null; notes: string;
  created_by: string; created_at: string | Date; updated_at: string | Date;
  revision: number | string;
}

const COLUMNS = `id, trip_id, type, status, title, provider,
  confirmation_number, start_at, end_at, timezone, location_name, address,
  latitude, longitude, day_number, stop_id, expense_id, amount_minor, currency,
  notes, created_by, created_at, updated_at, revision`;

export class SqlReservationRepository implements ReservationRepository {
  private readonly dialect;
  constructor(private readonly db: SqlClient) {
    this.dialect = createDialect(db.provider);
  }

  async listByTrip(tripId: string): Promise<Reservation[]> {
    const { rows } = await this.db.query<ReservationRow>(
      `SELECT ${COLUMNS} FROM reservations WHERE trip_id = $1
       ORDER BY start_at ASC, created_at ASC, id ASC`,
      [tripId],
    );
    return rows.map(toReservation);
  }

  async findById(tripId: string, id: string): Promise<Reservation | null> {
    const { rows } = await this.db.query<ReservationRow>(
      `SELECT ${COLUMNS} FROM reservations WHERE trip_id = $1 AND id = $2`,
      [tripId, id],
    );
    return rows[0] ? toReservation(rows[0]) : null;
  }

  async create(
    reservation: Reservation,
    idempotencyKey: string,
  ): Promise<ReservationWriteResult> {
    const snapshot = reservation.toSnapshot();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const sql = this.dialect.insertIgnore(
        "reservations",
        `${COLUMNS}, idempotency_key`,
        Array.from({ length: 25 }, (_, index) => `$${index + 1}`).join(", "),
        "trip_id, created_by, idempotency_key",
      );
      const inserted = await client.query(sql, [
        ...snapshotParams(snapshot),
        idempotencyKey,
      ]);
      let written = reservation;
      if (inserted.rowCount === 0) {
        const existing = await client.query<ReservationRow>(
          `SELECT ${COLUMNS} FROM reservations
           WHERE trip_id = $1 AND created_by = $2 AND idempotency_key = $3`,
          [snapshot.tripId, snapshot.createdBy, idempotencyKey],
        );
        if (!existing.rows[0]) {
          throw new Error("Idempotent reservation write did not return a row");
        }
        written = toReservation(existing.rows[0]);
      } else {
        await bumpTripVersion(client, snapshot.tripId);
      }
      const tripRevision = await readTripVersion(client, snapshot.tripId);
      await client.query("COMMIT");
      return { reservation: written, tripRevision };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async save(
    reservation: Reservation,
    previousRevision: number,
  ): Promise<ReservationWriteResult | null> {
    const snapshot = reservation.toSnapshot();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE reservations SET
           type = $3, status = $4, title = $5, provider = $6,
           confirmation_number = $7, start_at = $8, end_at = $9,
           timezone = $10, location_name = $11, address = $12,
           latitude = $13, longitude = $14, day_number = $15,
           stop_id = $16, expense_id = $17, amount_minor = $18,
           currency = $19, notes = $20, updated_at = $21, revision = $22
         WHERE trip_id = $1 AND id = $2 AND revision = $23`,
        [
          snapshot.tripId, snapshot.id, snapshot.type, snapshot.status,
          snapshot.title, snapshot.provider, snapshot.confirmationNumber,
          snapshot.startAt, snapshot.endAt, snapshot.timezone,
          snapshot.locationName, snapshot.address, snapshot.latitude,
          snapshot.longitude, snapshot.dayNumber, snapshot.stopId,
          snapshot.expenseId, snapshot.amountMinor, snapshot.currency,
          snapshot.notes, snapshot.updatedAt, snapshot.revision, previousRevision,
        ],
      );
      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      await bumpTripVersion(client, snapshot.tripId);
      const tripRevision = await readTripVersion(client, snapshot.tripId);
      await client.query("COMMIT");
      return { reservation, tripRevision };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(
    tripId: string,
    id: string,
    expectedRevision: number,
  ): Promise<{ deleted: boolean; tripRevision: number }> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `DELETE FROM reservations WHERE trip_id = $1 AND id = $2 AND revision = $3`,
        [tripId, id, expectedRevision],
      );
      if (result.rowCount === 0) {
        const tripRevision = await readTripVersion(client, tripId);
        await client.query("ROLLBACK");
        return { deleted: false, tripRevision };
      }
      await bumpTripVersion(client, tripId);
      const tripRevision = await readTripVersion(client, tripId);
      await client.query("COMMIT");
      return { deleted: true, tripRevision };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function snapshotParams(snapshot: ReservationSnapshot): unknown[] {
  return [
    snapshot.id, snapshot.tripId, snapshot.type, snapshot.status,
    snapshot.title, snapshot.provider, snapshot.confirmationNumber,
    snapshot.startAt, snapshot.endAt, snapshot.timezone,
    snapshot.locationName, snapshot.address, snapshot.latitude,
    snapshot.longitude, snapshot.dayNumber, snapshot.stopId,
    snapshot.expenseId, snapshot.amountMinor, snapshot.currency,
    snapshot.notes, snapshot.createdBy, snapshot.createdAt,
    snapshot.updatedAt, snapshot.revision,
  ];
}

function toReservation(row: ReservationRow): Reservation {
  return Reservation.fromSnapshot({
    id: row.id,
    tripId: row.trip_id,
    type: row.type as ReservationType,
    status: row.status as ReservationStatus,
    title: row.title,
    provider: row.provider,
    confirmationNumber: row.confirmation_number,
    startAt: new Date(row.start_at).toISOString(),
    endAt: row.end_at == null ? null : new Date(row.end_at).toISOString(),
    timezone: row.timezone,
    locationName: row.location_name,
    address: row.address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    dayNumber: row.day_number == null ? null : Number(row.day_number),
    stopId: row.stop_id,
    expenseId: row.expense_id,
    amountMinor: row.amount_minor == null ? null : Number(row.amount_minor),
    currency: row.currency,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    revision: Number(row.revision),
  });
}

async function bumpTripVersion(client: SqlConnection, tripId: string) {
  await client.query(`UPDATE trips SET version = version + 1 WHERE id = $1`, [tripId]);
}

async function readTripVersion(client: SqlConnection, tripId: string) {
  const { rows } = await client.query<{ version: number | string }>(
    `SELECT version FROM trips WHERE id = $1`, [tripId],
  );
  if (!rows[0]) throw new Error(`Trip ${tripId} not found after reservation write`);
  return Number(rows[0].version);
}
