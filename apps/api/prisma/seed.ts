import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { seedTrips } from "../src/infrastructure/persistence/seed-data";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const { snapshot: t, startLabel, endLabel, coverColor } of seedTrips()) {
    await prisma.$transaction(async (tx) => {
      await tx.trips.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          title: t.title,
          start_date: startLabel,
          end_date: endLabel,
          status: t.status,
          currency: t.currency,
          cover_color: coverColor,
          owner_id: t.ownerId,
        },
        update: {
          title: t.title,
          start_date: startLabel,
          end_date: endLabel,
          status: t.status,
          currency: t.currency,
          cover_color: coverColor,
          owner_id: t.ownerId,
        },
      });

      await tx.trip_members.deleteMany({ where: { trip_id: t.id } });
      await tx.trip_days.deleteMany({ where: { trip_id: t.id } });
      await tx.stops.deleteMany({ where: { trip_id: t.id } });
      await tx.expenses.deleteMany({ where: { trip_id: t.id } });

      for (const [i, m] of t.members.entries()) {
        await tx.trip_members.create({
          data: {
            id: m.id,
            trip_id: t.id,
            name: m.name,
            short_name: m.shortName,
            initials: m.initials,
            avatar_bg: m.avatarBg,
            avatar_fg: m.avatarFg,
            is_current_user: m.isCurrentUser,
            sort_order: i,
            user_id: m.userId ?? null,
            role: m.role,
            can_invite: m.canInvite,
          },
        });
      }

      for (const d of t.days) {
        await tx.trip_days.create({
          data: {
            trip_id: t.id,
            number: d.number,
            date: d.date,
            date_label: d.dateLabel,
            city: d.city,
            color: d.color,
          },
        });
      }

      for (const [i, s] of t.stops.entries()) {
        await tx.stops.create({
          data: {
            id: s.id,
            trip_id: t.id,
            day: s.day,
            time: s.time,
            duration: s.duration,
            name: s.name,
            area: s.area,
            category: s.category,
            lat: s.lat,
            lng: s.lng,
            cost: s.cost,
            cost_currency: s.costCurrency,
            created_by: s.createdBy,
            transit: s.transit,
            note: s.note,
            sort_order: i,
            stop_votes: {
              create: s.votes.map((memberId) => ({ member_id: memberId })),
            },
            stop_comments: {
              create: s.comments.map((c) => ({
                author_id: c.author,
                text: c.text,
                time_label: c.timeLabel,
              })),
            },
          },
        });
      }

      for (const [i, e] of t.expenses.entries()) {
        await tx.expenses.create({
          data: {
            id: e.id,
            trip_id: t.id,
            description: e.description,
            payer_id: e.payer,
            amount: e.amount,
            currency: e.currency,
            when_label: e.whenLabel,
            sort_order: i,
            expense_participants: {
              create: e.participants.map((memberId) => ({ member_id: memberId })),
            },
          },
        });
      }
    });

    console.log(`seeded trip ${t.id}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
