import type {
  DaySnapshot,
  ExpenseSnapshot,
  MemberSnapshot,
  StopSnapshot,
  TripIntake,
  TripRepository,
  TripSnapshot,
  TripStatus,
  TripSummary,
} from "../../domain/trip";
import { memberInitials, memberShortName, Trip } from "../../domain/trip";
import type {
  MemberProfileUpdate,
  SyncedMemberTrip,
} from "../../application/user/profile-projection-service";
import { createDialect, type SqlClient, type SqlConnection } from "./sql";

/** Parse intake JSON from Postgres/MySQL drivers (object or string). */
function parseTripIntake(raw: unknown): TripIntake | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as TripIntake;
}

/** Dialect-agnostic Trip aggregate repository (Postgres + MySQL). */
export class SqlTripRepository implements TripRepository {
  private dialect;

  constructor(private db: SqlClient) {
    this.dialect = createDialect(db.provider);
  }

  async findSummaries(userId: string): Promise<TripSummary[]> {
    const { falseLiteral } = this.dialect;
    const { rows } = await this.db.query<{
      id: string;
      title: string;
      start_date: string;
      end_date: string;
      status: string;
      currency: string;
      cover_color: string;
      cover_url: string | null;
      owner_id: string | null;
      created_at: string | Date;
      member_count: string | number;
      stop_count: string | number;
      location_lat: string | number | null;
      location_lng: string | number | null;
    }>(
      `SELECT t.id, t.title, t.start_date, t.end_date, t.status, t.currency, t.cover_color,
              t.cover_url, t.owner_id, t.created_at,
              (SELECT count(*) FROM trip_members m WHERE m.trip_id = t.id) AS member_count,
              (SELECT count(*) FROM stops s WHERE s.trip_id = t.id) AS stop_count,
              (SELECT s.lat FROM stops s
               WHERE s.trip_id = t.id AND s.transit = ${falseLiteral}
                 AND s.lat IS NOT NULL AND s.lng IS NOT NULL
               ORDER BY s.sort_order ASC LIMIT 1) AS location_lat,
              (SELECT s.lng FROM stops s
               WHERE s.trip_id = t.id AND s.transit = ${falseLiteral}
                 AND s.lat IS NOT NULL AND s.lng IS NOT NULL
               ORDER BY s.sort_order ASC LIMIT 1) AS location_lng
       FROM trips t
       WHERE EXISTS (
               SELECT 1 FROM trip_members m
               WHERE m.trip_id = t.id AND m.user_id = $1
             )
          OR NOT EXISTS (
               SELECT 1 FROM trip_members m
               WHERE m.trip_id = t.id AND m.user_id IS NOT NULL
             )
       ORDER BY t.created_at DESC`,
      [userId],
    );
    if (rows.length === 0) return [];

    const tripIds = rows.map((r) => r.id);
    const any = this.dialect.anyEqual("trip_id", tripIds, 1);
    const memberRes = await this.db.query<{
      trip_id: string;
      id: string;
      name: string;
      initials: string;
      avatar_bg: string;
      avatar_fg: string;
      image: string | null;
      is_current_user: boolean | number;
    }>(
      `SELECT trip_id, id, name, initials, avatar_bg, avatar_fg, image, is_current_user
       FROM trip_members WHERE ${any.sql} ORDER BY sort_order ASC`,
      any.params,
    );

    const membersByTrip = new Map<string, TripSummary["members"]>();
    for (const m of memberRes.rows) {
      const list = membersByTrip.get(m.trip_id) ?? [];
      list.push({
        id: m.id,
        name: m.name,
        initials: m.initials,
        avatarBg: m.avatar_bg,
        avatarFg: m.avatar_fg,
        image: m.image,
        isCurrentUser: Boolean(m.is_current_user),
      });
      membersByTrip.set(m.trip_id, list);
    }

    return rows.map((r) => {
      const all = membersByTrip.get(r.id) ?? [];
      const ownerIdx = all.findIndex((m) => m.id === r.owner_id);
      const members =
        ownerIdx > 0
          ? [all[ownerIdx]!, ...all.slice(0, ownerIdx), ...all.slice(ownerIdx + 1)]
          : all;
      const locationLat = r.location_lat != null ? Number(r.location_lat) : null;
      const locationLng = r.location_lng != null ? Number(r.location_lng) : null;
      return {
        id: r.id,
        title: r.title,
        startLabel: r.start_date,
        endLabel: r.end_date,
        status: r.status as TripStatus,
        currency: r.currency,
        coverColor: r.cover_color,
        coverUrl: r.cover_url ?? null,
        memberCount: Number(r.member_count),
        stopCount: Number(r.stop_count),
        createdAt: new Date(r.created_at).toISOString(),
        creatorName: members[0]?.name ?? "",
        members,
        location:
          locationLat != null && locationLng != null
            ? { lat: locationLat, lng: locationLng }
            : null,
      };
    });
  }

  async findById(id: string): Promise<Trip | null> {
    const tripRes = await this.db.query<{
      id: string;
      title: string;
      status: string;
      currency: string;
      start_date: string;
      end_date: string;
      cover_url: string | null;
      intake: unknown;
      agent_seed_pending: boolean | number;
      owner_id: string;
      version: number;
    }>(
      `SELECT id, title, status, currency, start_date, end_date, cover_url, intake,
              agent_seed_pending, owner_id, version
       FROM trips WHERE id = $1`,
      [id],
    );
    const base = tripRes.rows[0];
    if (!base) return null;

    const [members, days, stops, votes, comments, expenses, parts] =
      await Promise.all([
        this.db.query(
          `SELECT id, name, short_name, initials, avatar_bg, avatar_fg, image, is_current_user,
                  user_id, role, can_invite
           FROM trip_members WHERE trip_id = $1 ORDER BY sort_order ASC`,
          [id],
        ),
        this.db.query(
          `SELECT number, date, date_label, city, color FROM trip_days WHERE trip_id = $1 ORDER BY number ASC`,
          [id],
        ),
        this.db.query(
          `SELECT id, day, time, duration, name, area, category, lat, lng, cost, cost_currency, created_by, transit, note, sort_order
           FROM stops WHERE trip_id = $1 ORDER BY sort_order ASC`,
          [id],
        ),
        this.db.query(
          `SELECT sv.stop_id, sv.member_id FROM stop_votes sv
           JOIN stops s ON s.id = sv.stop_id WHERE s.trip_id = $1`,
          [id],
        ),
        this.db.query(
          `SELECT sc.stop_id, sc.author_id, sc.text, sc.time_label FROM stop_comments sc
           JOIN stops s ON s.id = sc.stop_id WHERE s.trip_id = $1 ORDER BY sc.created_at ASC`,
          [id],
        ),
        this.db.query(
          `SELECT id, description, payer_id, amount, currency, category, when_label, sort_order
           FROM expenses WHERE trip_id = $1 ORDER BY sort_order ASC`,
          [id],
        ),
        this.db.query(
          `SELECT ep.expense_id, ep.member_id FROM expense_participants ep
           JOIN expenses e ON e.id = ep.expense_id WHERE e.trip_id = $1`,
          [id],
        ),
      ]);

    const votesByStop = new Map<string, string[]>();
    for (const v of votes.rows as { stop_id: string; member_id: string }[]) {
      const list = votesByStop.get(v.stop_id) ?? [];
      list.push(v.member_id);
      votesByStop.set(v.stop_id, list);
    }
    const commentsByStop = new Map<string, StopSnapshot["comments"]>();
    for (const c of comments.rows as {
      stop_id: string;
      author_id: string;
      text: string;
      time_label: string;
    }[]) {
      const list = commentsByStop.get(c.stop_id) ?? [];
      list.push({ author: c.author_id, timeLabel: c.time_label, text: c.text });
      commentsByStop.set(c.stop_id, list);
    }
    const partsByExpense = new Map<string, string[]>();
    for (const p of parts.rows as { expense_id: string; member_id: string }[]) {
      const list = partsByExpense.get(p.expense_id) ?? [];
      list.push(p.member_id);
      partsByExpense.set(p.expense_id, list);
    }

    const stopSnapshots: StopSnapshot[] = (
      stops.rows as Array<{
        id: string;
        day: number;
        time: string;
        duration: string;
        name: string;
        area: string;
        category: string;
        lat: number;
        lng: number;
        cost: number;
        cost_currency: string | null;
        created_by: string;
        transit: boolean | number;
        note: string | null;
        sort_order: number;
      }>
    ).map((s) => ({
      id: s.id,
      day: s.day,
      time: s.time,
      duration: s.duration,
      name: s.name,
      area: s.area,
      category: s.category as StopSnapshot["category"],
      lat: Number(s.lat),
      lng: Number(s.lng),
      cost: Number(s.cost),
      costCurrency: s.cost_currency ?? "",
      createdBy: s.created_by,
      transit: Boolean(s.transit),
      order: s.sort_order,
      note: s.note ?? "",
      votes: votesByStop.get(s.id) ?? [],
      comments: commentsByStop.get(s.id) ?? [],
    }));

    const expenseSnapshots: ExpenseSnapshot[] = (
      expenses.rows as Array<{
        id: string;
        description: string;
        payer_id: string;
        amount: number;
        currency: string | null;
        category: string | null;
        when_label: string;
        sort_order: number;
      }>
    ).map((e) => ({
      id: e.id,
      description: e.description,
      payer: e.payer_id,
      amount: Number(e.amount),
      currency: e.currency ?? "",
      category: (e.category as ExpenseSnapshot["category"]) ?? "Plan",
      participants: partsByExpense.get(e.id) ?? [],
      whenLabel: e.when_label,
      createdOrder: e.sort_order,
    }));

    const snapshot: TripSnapshot = {
      id: base.id,
      title: base.title,
      status: base.status as TripStatus,
      currency: base.currency,
      version: Number(base.version),
      startDate: base.start_date ?? "",
      endDate: base.end_date ?? "",
      coverUrl: base.cover_url ?? null,
      intake: parseTripIntake(base.intake),
      agentSeedPending: Boolean(base.agent_seed_pending),
      ownerId: base.owner_id,
      members: (members.rows as Array<Record<string, unknown>>).map((m) => ({
        id: m.id as string,
        name: m.name as string,
        shortName: m.short_name as string,
        initials: m.initials as string,
        avatarBg: m.avatar_bg as string,
        avatarFg: m.avatar_fg as string,
        image: m.image as string | null,
        userId: (m.user_id as string | null) ?? null,
        role: m.role as MemberSnapshot["role"],
        canInvite: Boolean(m.can_invite),
        isCurrentUser: Boolean(m.is_current_user),
      })),
      days: (days.rows as Array<Record<string, unknown>>).map((d) => ({
        number: Number(d.number),
        date: d.date as string,
        dateLabel: d.date_label as string,
        city: d.city as string,
        color: d.color as string,
      })),
      stops: stopSnapshots,
      expenses: expenseSnapshots,
    };

    return Trip.fromSnapshot(snapshot);
  }

  async create(trip: Trip): Promise<void> {
    const s = trip.toSnapshot();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO trips (id, title, start_date, end_date, status, currency, cover_color,
                            cover_url, intake, agent_seed_pending, owner_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          s.id,
          s.title,
          s.startDate,
          s.endDate,
          s.status,
          s.currency,
          s.days[0]?.color ?? "#3f6fc9",
          s.coverUrl,
          s.intake ? JSON.stringify(s.intake) : null,
          s.agentSeedPending,
          s.ownerId,
        ],
      );
      for (const [i, m] of s.members.entries()) {
        await client.query(
          `INSERT INTO trip_members (id, trip_id, name, short_name, initials, avatar_bg, avatar_fg, image, is_current_user, sort_order, user_id, role, can_invite)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            m.id,
            s.id,
            m.name,
            m.shortName,
            m.initials,
            m.avatarBg,
            m.avatarFg,
            m.image ?? null,
            m.isCurrentUser,
            i,
            m.userId ?? null,
            m.role,
            m.canInvite,
          ],
        );
      }
      for (const d of s.days) {
        await client.query(
          `INSERT INTO trip_days (trip_id, number, date, date_label, city, color)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [s.id, d.number, d.date, d.dateLabel, d.city, d.color],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async addMember(tripId: string, member: MemberSnapshot): Promise<void> {
    // Resolve sort_order outside the INSERT so MySQL does not reject a
    // same-table subquery in the VALUES list.
    const { rows } = await this.db.query<{ next_order: string | number | null }>(
      `SELECT max(sort_order) + 1 AS next_order FROM trip_members WHERE trip_id = $1`,
      [tripId],
    );
    const sortOrder = Number(rows[0]?.next_order ?? 0);
    const sql = this.dialect.insertIgnore(
      "trip_members",
      "id, trip_id, name, short_name, initials, avatar_bg, avatar_fg, image, is_current_user, sort_order, user_id, role, can_invite",
      `$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13`,
      "trip_id, user_id",
    );
    await this.db.query(sql, [
      member.id,
      tripId,
      member.name,
      member.shortName,
      member.initials,
      member.avatarBg,
      member.avatarFg,
      member.image ?? null,
      member.isCurrentUser,
      sortOrder,
      member.userId ?? null,
      member.role,
      member.canInvite,
    ]);
    await bumpVersion(this.db, tripId);
  }

  async syncMemberProfile(
    userId: string,
    profile: MemberProfileUpdate,
  ): Promise<SyncedMemberTrip[]> {
    if (profile.name === undefined && profile.image === undefined) return [];

    const { rows } = await this.db.query<{ trip_id: string }>(
      `SELECT trip_id FROM trip_members WHERE user_id = $1`,
      [userId],
    );
    const tripIds = [...new Set(rows.map((row) => row.trip_id))];
    if (tripIds.length === 0) return [];

    const assignments: string[] = [];
    const params: unknown[] = [userId];
    if (profile.name !== undefined) {
      params.push(profile.name);
      assignments.push(`name = $${params.length}`);
      params.push(memberShortName(profile.name));
      assignments.push(`short_name = $${params.length}`);
      params.push(memberInitials(profile.name));
      assignments.push(`initials = $${params.length}`);
    }
    if (profile.image !== undefined) {
      params.push(profile.image);
      assignments.push(`image = $${params.length}`);
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE trip_members SET ${assignments.join(", ")} WHERE user_id = $1`,
        params,
      );

      const synced: SyncedMemberTrip[] = [];
      for (const tripId of tripIds) {
        await bumpVersion(client, tripId);
        const version = await client.query<{ version: number | string }>(
          `SELECT version FROM trips WHERE id = $1`,
          [tripId],
        );
        const revision = Number(version.rows[0]?.version);
        if (Number.isSafeInteger(revision)) synced.push({ tripId, revision });
      }
      await client.query("COMMIT");
      return synced;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rename(id: string, title: string): Promise<void> {
    await this.db.query(
      `UPDATE trips SET title = $2, version = version + 1 WHERE id = $1`,
      [id, title],
    );
  }

  async clearAgentSeedPending(id: string): Promise<void> {
    await this.db.query(
      `UPDATE trips SET agent_seed_pending = $2, version = version + 1 WHERE id = $1`,
      [id, false],
    );
  }

  async updateIntake(id: string, intake: TripIntake | null): Promise<void> {
    await this.db.query(
      `UPDATE trips SET intake = $2, version = version + 1 WHERE id = $1`,
      [id, intake ? JSON.stringify(intake) : null],
    );
  }

  async addDay(tripId: string, day: DaySnapshot): Promise<void> {
    const sql = this.dialect.insertIgnore(
      "trip_days",
      "trip_id, number, date, date_label, city, color",
      "$1,$2,$3,$4,$5,$6",
      "trip_id, number",
    );
    await this.db.query(sql, [
      tripId,
      day.number,
      day.date,
      day.dateLabel,
      day.city,
      day.color,
    ]);
    await bumpVersion(this.db, tripId);
  }

  async updateDay(tripId: string, day: DaySnapshot): Promise<void> {
    await this.db.query(
      `UPDATE trip_days SET date = $3, date_label = $4, city = $5, color = $6
       WHERE trip_id = $1 AND number = $2`,
      [tripId, day.number, day.date, day.dateLabel, day.city, day.color],
    );
    await bumpVersion(this.db, tripId);
  }

  async reorderDays(trip: Trip): Promise<void> {
    const s = trip.toSnapshot();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM trip_days WHERE trip_id = $1`, [s.id]);
      for (const d of s.days) {
        await client.query(
          `INSERT INTO trip_days (trip_id, number, date, date_label, city, color)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [s.id, d.number, d.date, d.dateLabel, d.city, d.color],
        );
      }
      await client.query(`DELETE FROM stops WHERE trip_id = $1`, [s.id]);
      await insertStops(client, s.id, s.stops);
      await bumpVersion(client, s.id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteDay(trip: Trip): Promise<void> {
    return this.reorderDays(trip);
  }

  async save(trip: Trip): Promise<void> {
    const s = trip.toSnapshot();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM stops WHERE trip_id = $1`, [s.id]);
      await client.query(`DELETE FROM expenses WHERE trip_id = $1`, [s.id]);

      await insertStops(client, s.id, s.stops);

      for (const e of s.expenses) {
        await client.query(
          `INSERT INTO expenses (id, trip_id, description, payer_id, amount, currency, category, when_label, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            e.id,
            s.id,
            e.description,
            e.payer,
            e.amount,
            e.currency,
            e.category,
            e.whenLabel,
            e.createdOrder,
          ],
        );
        for (const memberId of e.participants) {
          await client.query(
            `INSERT INTO expense_participants (expense_id, member_id) VALUES ($1,$2)`,
            [e.id, memberId],
          );
        }
      }

      await bumpVersion(client, s.id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

async function bumpVersion(
  executor: Pick<SqlClient | SqlConnection, "query">,
  tripId: string,
): Promise<void> {
  await executor.query(`UPDATE trips SET version = version + 1 WHERE id = $1`, [
    tripId,
  ]);
}

async function insertStops(
  client: SqlConnection,
  tripId: string,
  stops: readonly StopSnapshot[],
): Promise<void> {
  for (const st of stops) {
    await client.query(
      `INSERT INTO stops (id, trip_id, day, time, duration, name, area, category, lat, lng, cost, cost_currency, created_by, transit, note, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        st.id,
        tripId,
        st.day,
        st.time,
        st.duration,
        st.name,
        st.area,
        st.category,
        st.lat,
        st.lng,
        st.cost,
        st.costCurrency,
        st.createdBy,
        st.transit,
        st.note,
        st.order,
      ],
    );
    for (const memberId of st.votes) {
      await client.query(
        `INSERT INTO stop_votes (stop_id, member_id) VALUES ($1,$2)`,
        [st.id, memberId],
      );
    }
    for (const c of st.comments) {
      await client.query(
        `INSERT INTO stop_comments (stop_id, author_id, text, time_label)
         VALUES ($1,$2,$3,$4)`,
        [st.id, c.author, c.text, c.timeLabel],
      );
    }
  }
}

/** @deprecated Use SqlTripRepository */
export { SqlTripRepository as PgTripRepository };
