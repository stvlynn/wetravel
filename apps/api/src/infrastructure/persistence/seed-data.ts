import type { TripSnapshot } from "../../domain/trip";

export interface SeedMemberDef {
  id: string;
  name: string;
  short: string;
  initials: string;
  bg: string;
  fg: string;
  me?: boolean;
}

export interface SeedTrip {
  snapshot: TripSnapshot;
  startLabel: string;
  endLabel: string;
  coverColor: string;
}

const MEMBERS: SeedMemberDef[] = [
  { id: "lynn", name: "Lynn Weber", short: "Lynn", initials: "LW", bg: "#dde7fb", fg: "#2b4d93", me: true },
  { id: "marco", name: "Marco Bailey", short: "Marco", initials: "MB", bg: "#dde2ee", fg: "#3c4760" },
  { id: "aiko", name: "Aiko Tanaka", short: "Aiko", initials: "AT", bg: "#d9efe6", fg: "#1f6b4d" },
  { id: "sam", name: "Sam Porter", short: "Sam", initials: "SP", bg: "#f3e8d3", fg: "#7a5a1e" },
];

const ALL = MEMBERS.map((m) => m.id);

function members(): TripSnapshot["members"] {
  return MEMBERS.map((m) => ({
    id: m.id,
    name: m.name,
    shortName: m.short,
    initials: m.initials,
    avatarBg: m.bg,
    avatarFg: m.fg,
    // Legacy/demo members are not backed by real users; they keep full access
    // so the seeded planner stays fully interactive for any signed-in user.
    userId: null,
    role: m.me ? "owner" : "editor",
    canInvite: true,
    isCurrentUser: !!m.me,
  }));
}

const DAYS: TripSnapshot["days"] = [
  { number: 1, date: "2025-10-12", dateLabel: "", city: "Tokyo", color: "#3f6fc9" },
  { number: 2, date: "2025-10-13", dateLabel: "", city: "Tokyo", color: "#305bb0" },
  { number: 3, date: "2025-10-14", dateLabel: "", city: "Tokyo → Kyoto", color: "#28304a" },
  { number: 4, date: "2025-10-15", dateLabel: "", city: "Kyoto", color: "#3c8f6f" },
  { number: 5, date: "2025-10-16", dateLabel: "", city: "Kyoto → Osaka", color: "#6d788f" },
];

interface RawStop {
  id: string;
  day: number;
  time: string;
  dur: string;
  name: string;
  area: string;
  cat: TripSnapshot["stops"][number]["category"];
  lat: number;
  lng: number;
  cost: number;
  by: string;
  votes: string[];
  comments: { by: string; time: string; text: string }[];
  transit?: boolean;
}

const RAW_STOPS: RawStop[] = [
  { id: "s1", day: 1, time: "09:30", dur: "1.5h", name: "Senso-ji Temple", area: "Asakusa", cat: "Sight", lat: 35.7148, lng: 139.7967, cost: 0, by: "marco", votes: ["lynn", "marco"], comments: [{ by: "marco", time: "3d ago", text: "Go early — the Kaminarimon photo is impossible after 10." }] },
  { id: "s2", day: 1, time: "12:00", dur: "1h", name: "Nakamise-dori street food", area: "Asakusa", cat: "Food", lat: 35.7112, lng: 139.7965, cost: 1500, by: "marco", votes: [], comments: [] },
  { id: "s3", day: 1, time: "15:00", dur: "2.5h", name: "teamLab Planets", area: "Toyosu", cat: "Activity", lat: 35.6494, lng: 139.7898, cost: 3700, by: "aiko", votes: ["lynn", "marco", "aiko", "sam"], comments: [{ by: "aiko", time: "3d ago", text: "Book the 15:00 slot — weekday evenings sell out." }, { by: "marco", time: "2d ago", text: "Wear shorts. The water room is real." }] },
  { id: "s3b", day: 1, time: "17:00", dur: "45m", name: "Check in — Shibuya Stream Excel", area: "Shibuya", cat: "Stay", lat: 35.658, lng: 139.7016, cost: 0, by: "lynn", votes: [], comments: [] },
  { id: "s4", day: 1, time: "18:30", dur: "2h", name: "Shibuya Crossing + Ichiran", area: "Shibuya", cat: "Food", lat: 35.6595, lng: 139.7005, cost: 1400, by: "lynn", votes: ["sam"], comments: [] },
  { id: "s5", day: 2, time: "08:00", dur: "1.5h", name: "Tsukiji Outer Market", area: "Chuo", cat: "Food", lat: 35.6654, lng: 139.7707, cost: 1800, by: "lynn", votes: ["lynn", "aiko"], comments: [] },
  { id: "s6", day: 2, time: "10:30", dur: "1.5h", name: "Meiji Shrine", area: "Shibuya", cat: "Sight", lat: 35.6764, lng: 139.6993, cost: 0, by: "sam", votes: [], comments: [] },
  { id: "s7", day: 2, time: "13:00", dur: "2h", name: "Harajuku + Omotesando shopping", area: "Shibuya", cat: "Shopping", lat: 35.6702, lng: 139.7027, cost: 0, by: "sam", votes: [], comments: [] },
  { id: "s8", day: 2, time: "16:00", dur: "1.5h", name: "Shinjuku Gyoen", area: "Shinjuku", cat: "Park", lat: 35.6852, lng: 139.71, cost: 500, by: "aiko", votes: [], comments: [] },
  { id: "s9", day: 2, time: "19:30", dur: "2h", name: "Omoide Yokocho", area: "Shinjuku", cat: "Food", lat: 35.6938, lng: 139.6999, cost: 2500, by: "marco", votes: ["marco"], comments: [{ by: "marco", time: "2d ago", text: "Cash only, and most stalls seat six — perfect for us." }] },
  { id: "s10", day: 3, time: "08:24", dur: "2.5h", name: "Shinkansen Nozomi → Kyoto", area: "Tokyo Sta. → Kyoto Sta.", cat: "Transit", lat: 34.9858, lng: 135.7588, cost: 0, by: "lynn", votes: [], comments: [], transit: true },
  { id: "s11", day: 3, time: "11:30", dur: "2.5h", name: "Fushimi Inari Taisha", area: "Fushimi", cat: "Sight", lat: 34.9671, lng: 135.7727, cost: 0, by: "sam", votes: ["lynn", "sam"], comments: [{ by: "sam", time: "2d ago", text: "Start by 11 and we beat the tour buses to the upper gates." }] },
  { id: "s12", day: 3, time: "15:00", dur: "2h", name: "Gion + Hanamikoji walk", area: "Higashiyama", cat: "Walk", lat: 35.0037, lng: 135.7788, cost: 0, by: "lynn", votes: [], comments: [] },
  { id: "s12b", day: 3, time: "17:15", dur: "45m", name: "Check in — Gion machiya", area: "Higashiyama", cat: "Stay", lat: 35.0031, lng: 135.7752, cost: 0, by: "aiko", votes: [], comments: [] },
  { id: "s13", day: 3, time: "18:30", dur: "2h", name: "Pontocho Alley dinner", area: "Nakagyo", cat: "Food", lat: 35.009, lng: 135.771, cost: 4600, by: "marco", votes: ["aiko"], comments: [] },
  { id: "s14", day: 4, time: "08:00", dur: "2h", name: "Arashiyama Bamboo Grove", area: "Arashiyama", cat: "Sight", lat: 35.017, lng: 135.671, cost: 0, by: "aiko", votes: ["aiko", "lynn", "sam"], comments: [] },
  { id: "s15", day: 4, time: "11:00", dur: "1.5h", name: "Kinkaku-ji (Golden Pavilion)", area: "Kita", cat: "Sight", lat: 35.0394, lng: 135.7292, cost: 500, by: "aiko", votes: ["aiko"], comments: [{ by: "marco", time: "1d ago", text: "Swap for Ginkaku-ji if we run short? Way less crowded." }, { by: "lynn", time: "1d ago", text: "Both is too much — vote here and we keep the winner." }] },
  { id: "s16", day: 4, time: "14:00", dur: "1.5h", name: "Nishiki Market", area: "Nakagyo", cat: "Food", lat: 35.005, lng: 135.7649, cost: 2000, by: "marco", votes: [], comments: [] },
  { id: "s17", day: 4, time: "17:30", dur: "1.5h", name: "Kiyomizu-dera at sunset", area: "Higashiyama", cat: "Sight", lat: 34.9949, lng: 135.785, cost: 400, by: "lynn", votes: ["lynn", "marco", "aiko"], comments: [] },
  { id: "s18", day: 5, time: "09:15", dur: "1h", name: "Ltd. Express → Osaka", area: "Kyoto → Umeda", cat: "Transit", lat: 34.7025, lng: 135.4959, cost: 0, by: "lynn", votes: [], comments: [], transit: true },
  { id: "s19", day: 5, time: "10:30", dur: "2h", name: "Osaka Castle", area: "Chuo-ku", cat: "Sight", lat: 34.6873, lng: 135.5262, cost: 600, by: "sam", votes: [], comments: [] },
  { id: "s20", day: 5, time: "13:00", dur: "1.5h", name: "Kuromon Ichiba Market", area: "Nipponbashi", cat: "Food", lat: 34.6656, lng: 135.5062, cost: 2200, by: "aiko", votes: ["marco"], comments: [] },
  { id: "s21", day: 5, time: "16:00", dur: "1.5h", name: "Umeda Sky Building", area: "Kita-ku", cat: "Sight", lat: 34.7055, lng: 135.4903, cost: 1500, by: "sam", votes: [], comments: [] },
  { id: "s21b", day: 5, time: "17:45", dur: "1h", name: "Shinsaibashi-suji arcade", area: "Chuo-ku", cat: "Shopping", lat: 34.6724, lng: 135.501, cost: 0, by: "sam", votes: [], comments: [] },
  { id: "s22", day: 5, time: "19:00", dur: "3h", name: "Dotonbori night crawl", area: "Namba", cat: "Food", lat: 34.6687, lng: 135.5013, cost: 3000, by: "marco", votes: ["lynn", "marco", "sam"], comments: [{ by: "aiko", time: "5h ago", text: "Ending the trip here is non-negotiable." }] },
];

interface RawExpense {
  id: string;
  desc: string;
  payer: string;
  amount: number;
  parts: string[];
  when: string;
  cat: TripSnapshot["expenses"][number]["category"];
}

const RAW_EXPENSES: RawExpense[] = [
  { id: "e1", desc: "Hotel — Shibuya Stream (2 nights)", payer: "lynn", amount: 84000, parts: ALL, when: "Day 1–2", cat: "Stay" },
  { id: "e2", desc: "JR Pass × 4 (7-day)", payer: "marco", amount: 120000, parts: ALL, when: "Pre-trip", cat: "Transit" },
  { id: "e3", desc: "teamLab Planets tickets", payer: "aiko", amount: 11100, parts: ["lynn", "aiko", "sam"], when: "Day 1", cat: "Activity" },
  { id: "e4", desc: "Ichiran dinner", payer: "aiko", amount: 5600, parts: ALL, when: "Day 1", cat: "Food" },
  { id: "e5", desc: "Tsukiji breakfast crawl", payer: "lynn", amount: 7200, parts: ALL, when: "Day 2", cat: "Food" },
  { id: "e6", desc: "Kyoto machiya (2 nights)", payer: "sam", amount: 96000, parts: ALL, when: "Day 3–4", cat: "Stay" },
  { id: "e7", desc: "Pontocho riverside dinner", payer: "marco", amount: 18400, parts: ALL, when: "Day 3", cat: "Food" },
  { id: "e8", desc: "Pocket wifi + Suica top-ups", payer: "sam", amount: 9600, parts: ALL, when: "Pre-trip", cat: "Plan" },
];

function buildJapan(): SeedTrip {
  const snapshot: TripSnapshot = {
    id: "japan-2025",
    title: "Japan · Autumn",
    status: "active",
    currency: "JPY",
    startDate: "2025-10-12",
    ownerId: "demo",
    members: members(),
    days: DAYS,
    stops: RAW_STOPS.map((s, i) => ({
      id: s.id,
      day: s.day,
      time: s.time,
      duration: s.dur,
      name: s.name,
      area: s.area,
      category: s.cat,
      lat: s.lat,
      lng: s.lng,
      cost: s.cost,
      costCurrency: s.cost > 0 ? "JPY" : "",
      createdBy: s.by,
      transit: !!s.transit,
      order: i,
      note: "",
      votes: s.votes,
      comments: s.comments.map((c) => ({
        author: c.by,
        timeLabel: c.time,
        text: c.text,
      })),
    })),
    expenses: RAW_EXPENSES.map((e, i) => ({
      id: e.id,
      description: e.desc,
      payer: e.payer,
      amount: e.amount,
      currency: "JPY",
      category: e.cat,
      participants: e.parts,
      whenLabel: e.when,
      createdOrder: i,
    })),
  };
  return {
    snapshot,
    startLabel: "Oct 12",
    endLabel: "Oct 16",
    coverColor: "#3f6fc9",
  };
}

export function seedTrips(): SeedTrip[] {
  return [buildJapan()];
}
