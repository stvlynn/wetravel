import type { Pool, PoolClient } from "pg";
import { Trip } from "../../domain/trip";
import type {
  DaySnapshot,
  ExpenseSnapshot,
  MemberSnapshot,
  StopSnapshot,
  TripRepository,
  TripSnapshot,
  TripStatus,
  TripSummary,
} from "../../domain/trip";

/** PostgreSQL adapter for the Trip aggregate. Loads the whole aggregate on
 * read; on save, rewrites the mutable child rows in a transaction. Members and
 * days are managed by narrow repository methods instead of the full save. */
export class PgTripRepository implements TripRepository {
  constructor(private pool: Pool) {}

  async findSummaries(userId: string): Promise<TripSummary[]> {
    const { rows } = await this.pool.query<{
      id: string;
      title: string;
      start_date: string;
      end_date: string;
      status: string;
      currency: string;
      cover_color: string;
      owner_id: string | null;
      created_at: string | Date;
      member_count: string;
      stop_count: string;
    }>(
      // Return trips the user belongs to, plus legacy/demo trips that have no
      // real (user-backed) members yet so the seeded demo stays visible.
      `SELECT t.id, t.title, t.start_date, t.end_date, t.status, t.currency, t.cover_color,
              t.owner_id, t.created_at,
              (SELECT count(*) FROM trip_members m WHERE m.trip_id = t.id) AS member_count,
              (SELECT count(*) FROM stops s WHERE s.trip_id = t.id) AS stop_count
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

    const memberRes = await this.pool.query<{
      trip_id: string;
      id: string;
      name: string;
      initials: string;
      avatar_bg: string;
      avatar_fg: string;
      image: string | null;
      is_current_user: boolean;
    }>(
      `SELECT trip_id, id, name, initials, avatar_bg, avatar_fg, image, is_current_user
       FROM trip_members WHERE trip_id = ANY($1) ORDER BY sort_order ASC`,
      [rows.map((r) => r.id)],
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
        isCurrentUser: m.is_current_user,
      });
      membersByTrip.set(m.trip_id, list);
    }

    return rows.map((r) => {
      const all = membersByTrip.get(r.id) ?? [];
      // Surface the creator (owner) first so it sits on top of the avatar stack.
      const ownerIdx = all.findIndex((m) => m.id === r.owner_id);
      const members =
        ownerIdx > 0
          ? [all[ownerIdx]!, ...all.slice(0, ownerIdx), ...all.slice(ownerIdx + 1)]
          : all;
      return {
        id: r.id,
        title: r.title,
        startLabel: r.start_date,
        endLabel: r.end_date,
        status: r.status as TripStatus,
        currency: r.currency,
        coverColor: r.cover_color,
        memberCount: Number(r.member_count),
        stopCount: Number(r.stop_count),
        createdAt: new Date(r.created_at).toISOString(),
        creatorName: members[0]?.name ?? "",
        members,
      };
    });
  }

  async findById(id: string): Promise<Trip | null> {
    const tripRes = await this.pool.query<{
      id: string;
      title: string;
      status: string;
      currency: string;
      start_date: string;
      owner_id: string;
    }>(
      `SELECT id, title, status, currency, start_date, owner_id FROM trips WHERE id = $1`,
      [id],
    );
    const base = tripRes.rows[0];
    if (!base) return null;

    const [members, days, stops, votes, comments, expenses, parts] =
      await Promise.all([
        this.pool.query(
          `SELECT id, name, short_name, initials, avatar_bg, avatar_fg, image, is_current_user,
                  user_id, role, can_invite
           FROM trip_members WHERE trip_id = $1 ORDER BY sort_order ASC`,
          [id],
        ),
        this.pool.query(
          `SELECT number, date, date_label, city, color FROM trip_days WHERE trip_id = $1 ORDER BY number ASC`,
          [id],
        ),
        this.pool.query(
          `SELECT id, day, time, duration, name, area, category, lat, lng, cost, cost_currency, created_by, transit, note, sort_order
           FROM stops WHERE trip_id = $1 ORDER BY sort_order ASC`,
          [id],
        ),
        this.pool.query(
          `SELECT sv.stop_id, sv.member_id FROM stop_votes sv
           JOIN stops s ON s.id = sv.stop_id WHERE s.trip_id = $1`,
          [id],
        ),
        this.pool.query(
          `SELECT sc.stop_id, sc.author_id, sc.text, sc.time_label FROM stop_comments sc
           JOIN stops s ON s.id = sc.stop_id WHERE s.trip_id = $1 ORDER BY sc.created_at ASC`,
          [id],
        ),
        this.pool.query(
          `SELECT id, description, payer_id, amount, currency, when_label, sort_order
           FROM expenses WHERE trip_id = $1 ORDER BY sort_order ASC`,
          [id],
        ),
        this.pool.query(
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
        transit: boolean;
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
      transit: s.transit,
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
        when_label: string;
        sort_order: number;
      }>
    ).map((e) => ({
      id: e.id,
      description: e.description,
      payer: e.payer_id,
      amount: Number(e.amount),
      currency: e.currency ?? "",
      participants: partsByExpense.get(e.id) ?? [],
      whenLabel: e.when_label,
      createdOrder: e.sort_order,
    }));

    const snapshot: TripSnapshot = {
      id: base.id,
      title: base.title,
      status: base.status as TripStatus,
      currency: base.currency,
      startDate: base.start_date ?? "",
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
        canInvite: m.can_invite as boolean,
        isCurrentUser: m.is_current_user as boolean,
      })),
      days: (days.rows as Array<Record<string, unknown>>).map((d) => ({
        number: d.number as number,
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO trips (id, title, start_date, end_date, status, currency, cover_color, owner_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.id, s.title, s.startDate, "", s.status, s.currency, s.days[0]?.color ?? "#3f6fc9", s.ownerId],
      );
      for (const [i, m] of s.members.entries()) {
        await client.query(
          `INSERT INTO trip_members (id, trip_id, name, short_name, initials, avatar_bg, avatar_fg, image, is_current_user, sort_order, user_id, role, can_invite)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [m.id, s.id, m.name, m.shortName, m.initials, m.avatarBg, m.avatarFg, m.image ?? null, m.isCurrentUser, i, m.userId ?? null, m.role, m.canInvite],
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
    // Place the new member after the current highest sort_order. The unique
    // (trip_id, user_id) constraint makes concurrent double-joins a no-op.
    await this.pool.query(
      `INSERT INTO trip_members
         (id, trip_id, name, short_name, initials, avatar_bg, avatar_fg, image, is_current_user, sort_order, user_id, role, can_invite)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
               COALESCE((SELECT max(sort_order) + 1 FROM trip_members WHERE trip_id = $2), 0),
               $10,$11,$12)
       ON CONFLICT (trip_id, user_id) DO NOTHING`,
      [
        member.id,
        tripId,
        member.name,
        member.shortName,
        member.initials,
        member.avatarBg,
        member.avatarFg,
        member.image ?? null,
        member.isCurrentUser,
        member.userId ?? null,
        member.role,
        member.canInvite,
      ],
    );
  }

  async rename(id: string, title: string): Promise<void> {
    await this.pool.query(`UPDATE trips SET title = $2 WHERE id = $1`, [id, title]);
  }

  async addDay(tripId: string, day: DaySnapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO trip_days (trip_id, number, date, date_label, city, color)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (trip_id, number) DO NOTHING`,
      [tripId, day.number, day.date, day.dateLabel, day.city, day.color],
    );
  }

  async updateDay(tripId: string, day: DaySnapshot): Promise<void> {
    await this.pool.query(
      `UPDATE trip_days SET date = $3, date_label = $4, city = $5, color = $6
       WHERE trip_id = $1 AND number = $2`,
      [tripId, day.number, day.date, day.dateLabel, day.city, day.color],
    );
  }

  async reorderDays(trip: Trip): Promise<void> {
    const s = trip.toSnapshot();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // A reorder renumbers days and remaps every stop's day, so rewrite both
      // child sets atomically. Expenses are untouched by a day reorder.
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
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteDay(trip: Trip): Promise<void> {
    // A deletion renumbers remaining days and remaps stops, so the persistence
    // strategy is the same as a reorder: rewrite both child sets atomically.
    return this.reorderDays(trip);
  }

  async save(trip: Trip): Promise<void> {
    const s = trip.toSnapshot();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM stops WHERE trip_id = $1`, [s.id]);
      await client.query(`DELETE FROM expenses WHERE trip_id = $1`, [s.id]);

      await insertStops(client, s.id, s.stops);

      for (const e of s.expenses) {
        await client.query(
          `INSERT INTO expenses (id, trip_id, description, payer_id, amount, currency, when_label, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            e.id,
            s.id,
            e.description,
            e.payer,
            e.amount,
            e.currency,
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

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Insert stops with their votes and comments. Caller manages the surrounding
 * transaction and the preceding delete of existing rows. */
async function insertStops(
  client: PoolClient,
  tripId: string,
  stops: readonly StopSnapshot[],
): Promise<void> {
  for (const st of stops) {
    await client.query(
      `INSERT INTO stops (id, trip_id, day, time, duration, name, area, category, lat, lng, cost, cost_currency, created_by, transit, note, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        st.id, tripId, st.day, st.time, st.duration, st.name, st.area,
        st.category, st.lat, st.lng, st.cost, st.costCurrency, st.createdBy, st.transit, st.note, st.order,
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
