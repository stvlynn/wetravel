import { describe, expect, it } from "vitest";
import { Trip } from "../src/domain/trip";
import { computeBudget } from "../src/domain/trip";
import { seedTrips } from "../src/infrastructure/persistence/seed-data";

function freshTrip(): Trip {
  // Deep clone so aggregate mutations don't leak across tests.
  const snapshot = structuredClone(seedTrips()[0]!.snapshot);
  return Trip.fromSnapshot(snapshot);
}

describe("Trip aggregate", () => {
  it("creates a planning trip with the owner as its only current member", () => {
    const trip = Trip.create({ title: "  Kyoto week  " }, { id: "u1", name: "Ada Lovelace" });
    const s = trip.toSnapshot();
    expect(s.title).toBe("Kyoto week");
    expect(s.status).toBe("planning");
    expect(s.ownerId).toBe("u1");
    expect(s.stops).toHaveLength(0);
    expect(s.days).toHaveLength(1);
    // Start date is a real ISO date so day labels can show actual dates.
    expect(s.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.days[0]!.date).toBe(s.startDate);
    expect(s.days[0]!.dateLabel).toBe("");
    expect(s.members).toEqual([
      expect.objectContaining({ id: "u1", initials: "AL", image: null, isCurrentUser: true }),
    ]);
    expect(trip.currentMemberId()).toBe("u1");
  });

  it("carries the owner's avatar image into the member snapshot", () => {
    const trip = Trip.create(
      { title: "Hokkaido" },
      { id: "u1", name: "Ada", image: "https://example.com/ada.png" },
    );
    expect(trip.toSnapshot().members[0]!).toMatchObject({
      image: "https://example.com/ada.png",
    });
  });

  it("appends a new empty day with the next number and a cycled color", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    const day = trip.addDay();
    expect(day.number).toBe(2);
    expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(day.dateLabel).toBe("");
    expect(day.color).not.toBe(trip.toSnapshot().days[0]!.color);
    expect(trip.toSnapshot().days).toHaveLength(2);
  });



  it("updates itinerary day display metadata", () => {
    const trip = freshTrip();
    const day = trip.updateDay(4, {
      date: "2025-10-15",
      city: "  Kyoto  ",
      color: "#FF5733",
    });

    expect(day).toMatchObject({
      number: 4,
      date: "2025-10-15",
      city: "Kyoto",
      color: "#ff5733",
    });
    expect(trip.toSnapshot().days.find((d) => d.number === 4)).toBe(day);
  });

  it("rejects an invalid day color", () => {
    const trip = freshTrip();
    expect(() => trip.updateDay(1, { color: "not-a-color" })).toThrow();
    expect(() => trip.updateDay(1, { color: "#fff" })).toThrow();
  });

  it("rejects updating a missing itinerary day", () => {
    const trip = freshTrip();
    expect(() => trip.updateDay(99, { city: "Kyoto" })).toThrow();
  });

  it("deletes a day, renumbers remaining days, and removes its stops", () => {
    const trip = freshTrip();
    const before = structuredClone(trip.toSnapshot());
    const deletedNumber = 2;
    const stopsOnDeletedDay = before.stops.filter((s) => s.day === deletedNumber);

    trip.deleteDay(deletedNumber);
    const after = trip.toSnapshot();

    expect(after.days).toHaveLength(before.days.length - 1);
    expect(after.days.map((d) => d.number)).toEqual(
      before.days.filter((d) => d.number !== deletedNumber).map((_, i) => i + 1),
    );
    expect(after.stops).toHaveLength(before.stops.length - stopsOnDeletedDay.length);
    expect(after.stops.some((s) => stopsOnDeletedDay.map((stop) => stop.id).includes(s.id))).toBe(false);
    expect(after.stops.every((s) => s.day >= 1 && s.day <= after.days.length)).toBe(true);
    expect(after.stops.map((s) => s.order)).toEqual(
      after.stops.map((_, i) => i),
    );
  });

  it("rejects deleting a missing itinerary day", () => {
    const trip = freshTrip();
    expect(() => trip.deleteDay(99)).toThrow();
  });

  it("reorders days, renumbering sequentially and remapping stops", () => {
    const trip = freshTrip();
    const before = trip.toSnapshot();
    const original = before.days.map((d) => d.number);
    // Cities travel with each day so we can assert stops follow their day.
    const cityByOld = new Map(before.days.map((d) => [d.number, d.city]));
    const stopsByOldDay = new Map<number, string[]>();
    for (const s of before.stops) {
      stopsByOldDay.set(s.day, [...(stopsByOldDay.get(s.day) ?? []), s.id]);
    }

    // Move the last day to the front.
    const moved = [
      original[original.length - 1]!,
      ...original.slice(0, original.length - 1),
    ];
    trip.reorderDays(moved);
    const after = trip.toSnapshot();

    // Days are renumbered 1..N in the new sequence.
    expect(after.days.map((d) => d.number)).toEqual(
      original.map((_, i) => i + 1),
    );
    // The day that moved to the front keeps its city but is now day 1.
    expect(after.days[0]!.city).toBe(cityByOld.get(moved[0]!));
    // Its stops now report day 1 in their original per-day order.
    const nowDay1 = after.stops.filter((s) => s.day === 1).map((s) => s.id);
    expect(nowDay1).toEqual(stopsByOldDay.get(moved[0]!) ?? []);
    // Global stop order stays contiguous and grouped by the new day order.
    const orders = after.stops.map((s) => s.order);
    expect(orders).toEqual(orders.map((_, i) => i));
    expect(after.stops.map((s) => s.day)).toEqual(
      [...after.stops.map((s) => s.day)].sort((a, b) => a - b),
    );
  });

  it("rejects a day order that is not a permutation", () => {
    const trip = freshTrip();
    const numbers = trip.toSnapshot().days.map((d) => d.number);
    expect(() => trip.reorderDays([...numbers, 999])).toThrow();
    expect(() => trip.reorderDays(numbers.slice(1))).toThrow();
  });

  it("rejects creating a trip with a blank title", () => {
    expect(() => Trip.create({ title: "   " }, { id: "u1", name: "Ada" })).toThrow();
  });

  it("renames a trip with a trimmed title and rejects blanks", () => {
    const trip = Trip.create({ title: "new-0704" }, { id: "u1", name: "Ada" });
    trip.rename("  Hokkaido  ");
    expect(trip.toSnapshot().title).toBe("Hokkaido");
    expect(() => trip.rename("   ")).toThrow();
  });

  it("toggles a vote in and out for a member", () => {
    const trip = freshTrip();
    trip.toggleVote("s2", "lynn");
    expect(trip.toSnapshot().stops.find((s) => s.id === "s2")!.votes).toContain("lynn");
    trip.toggleVote("s2", "lynn");
    expect(trip.toSnapshot().stops.find((s) => s.id === "s2")!.votes).not.toContain("lynn");
  });

  it("rejects an empty comment", () => {
    const trip = freshTrip();
    expect(() => trip.addComment("s1", "lynn", "   ")).toThrow();
  });

  it("appends a trimmed comment authored by the member", () => {
    const trip = freshTrip();
    trip.addComment("s1", "lynn", "  Sounds great  ");
    const comments = trip.toSnapshot().stops.find((s) => s.id === "s1")!.comments;
    expect(comments.at(-1)).toMatchObject({ author: "lynn", text: "Sounds great" });
  });

  it("inserts a stop within a day and keeps ordering contiguous", () => {
    const trip = freshTrip();
    const before = trip.toSnapshot().stops.filter((s) => s.day === 1).length;
    trip.insertStop({ day: 1, index: 1, name: "Coffee break", time: "10:45" }, "lynn");
    const day1 = trip.toSnapshot().stops.filter((s) => s.day === 1);
    expect(day1.length).toBe(before + 1);
    expect(day1[1]!.name).toBe("Coffee break");
    const orders = trip.toSnapshot().stops.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("moves a stop across days and keeps ordering contiguous", () => {
    const trip = freshTrip();
    const before = trip.toSnapshot();
    const source = before.stops.find((s) => s.day === 1)!;
    const targetDay = before.days.find(
      (d) => d.number !== source.day && before.stops.some((s) => s.day === d.number),
    )!.number;
    const targetIndex = Math.min(
      1,
      before.stops.filter((s) => s.day === targetDay).length,
    );

    trip.moveStop({ stopId: source.id, day: targetDay, index: targetIndex });
    const after = trip.toSnapshot();
    const targetStops = after.stops.filter((s) => s.day === targetDay);

    expect(targetStops[targetIndex]!.id).toBe(source.id);
    expect(after.stops.find((s) => s.id === source.id)!.day).toBe(targetDay);
    expect(after.stops.map((s) => s.order)).toEqual(after.stops.map((_, i) => i));
    expect(after.stops.map((s) => s.day)).toEqual(
      [...after.stops.map((s) => s.day)].sort((a, b) => a - b),
    );
  });

  it("moves a stop within the same day", () => {
    const trip = freshTrip();
    const dayStops = trip.toSnapshot().stops.filter((s) => s.day === 1);
    const source = dayStops[0]!;

    trip.moveStop({
      stopId: source.id,
      day: source.day,
      index: dayStops.length - 1,
    });
    const afterDayStops = trip.toSnapshot().stops.filter((s) => s.day === source.day);

    expect(afterDayStops.at(-1)!.id).toBe(source.id);
  });

  it("applies optional category, cost, and note on insert (defaults otherwise)", () => {
    const trip = freshTrip();
    trip.insertStop(
      {
        day: 2,
        index: 0,
        name: "Ramen",
        time: "12:00",
        category: "Food",
        cost: 1800,
        note: "  Try the tsukemen ![pic](https://x/y.jpg)  ",
      },
      "lynn",
    );
    const withOpts = trip.toSnapshot().stops.find((s) => s.name === "Ramen")!;
    expect(withOpts.category).toBe("Food");
    expect(withOpts.cost).toBe(1800);
    // A cost with no explicit currency defaults to the trip currency.
    expect(withOpts.costCurrency).toBe("JPY");
    expect(withOpts.note).toBe("Try the tsukemen ![pic](https://x/y.jpg)");

    trip.insertStop(
      { day: 2, index: 0, name: "Coffee", time: "10:00", cost: 5, costCurrency: "USD" },
      "lynn",
    );
    const usd = trip.toSnapshot().stops.find((s) => s.name === "Coffee")!;
    expect(usd.costCurrency).toBe("USD");

    trip.insertStop({ day: 2, index: 0, name: "Plain", time: "" }, "lynn");
    const bare = trip.toSnapshot().stops.find((s) => s.name === "Plain")!;
    expect(bare.category).toBe("Plan");
    expect(bare.cost).toBe(0);
    // No cost means no currency is recorded (falls back to trip currency on read).
    expect(bare.costCurrency).toBe("");
    expect(bare.note).toBe("");
  });

  it("rejects an expense with no participants", () => {
    const trip = freshTrip();
    expect(() =>
      trip.addExpense({ description: "x", amount: 100, payer: "lynn", participants: [] }),
    ).toThrow();
  });

  it("stores expense currency, defaulting to the trip currency", () => {
    const trip = freshTrip();
    const defaultCurrency = trip.addExpense({
      description: "Taxi",
      amount: 2200,
      payer: "lynn",
      participants: ["lynn", "marco"],
    });
    expect(defaultCurrency.currency).toBe("JPY");

    const customCurrency = trip.addExpense({
      description: "Coffee",
      amount: 12,
      currency: "USD",
      payer: "lynn",
      participants: ["lynn", "marco"],
    });
    expect(customCurrency.currency).toBe("USD");
  });
});

describe("Trip membership", () => {
  it("makes the creator an owner who can edit and invite", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    const perms = trip.permissionsFor("u1");
    expect(perms).toEqual({ isMember: true, canEdit: true, canInvite: true });
    expect(trip.toSnapshot().members[0]!).toMatchObject({
      userId: "u1",
      role: "owner",
      canInvite: true,
    });
  });

  it("adds a real user as a member with the requested role", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    const member = trip.addMember({
      userId: "u2",
      name: "Grace Hopper",
      role: "viewer",
      canInvite: false,
    });
    expect(member).toMatchObject({
      userId: "u2",
      role: "viewer",
      canInvite: false,
      initials: "GH",
    });
    expect(trip.memberByUserId("u2")).toBe(member);
  });

  it("rejects adding the same user twice", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    trip.addMember({ userId: "u2", name: "Grace", role: "editor", canInvite: false });
    expect(() =>
      trip.addMember({ userId: "u2", name: "Grace", role: "editor", canInvite: false }),
    ).toThrow();
  });

  it("gives viewers read access but no edit rights", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    trip.addMember({ userId: "u2", name: "Grace", role: "viewer", canInvite: false });
    expect(trip.permissionsFor("u2")).toEqual({
      isMember: true,
      canEdit: false,
      canInvite: false,
    });
  });

  it("denies access to non-members on real trips", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    expect(trip.permissionsFor("stranger")).toEqual({
      isMember: false,
      canEdit: false,
      canInvite: false,
    });
  });

  it("keeps legacy/demo trips open to any signed-in user", () => {
    const trip = freshTrip();
    // Seed members have no backing userId, so anyone may act on the demo trip.
    expect(trip.permissionsFor("anyone")).toEqual({
      isMember: true,
      canEdit: true,
      canInvite: true,
    });
    expect(trip.actingMemberId("anyone")).toBe("lynn");
  });

  it("routes actions to the acting user's own membership", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    const member = trip.addMember({
      userId: "u2",
      name: "Grace",
      role: "editor",
      canInvite: false,
    });
    expect(trip.actingMemberId("u2")).toBe(member.id);
  });
});

describe("computeBudget", () => {
  const members = [
    { id: "a", name: "A", shortName: "A", initials: "A", avatarBg: "", avatarFg: "", userId: null, role: "editor" as const, canInvite: true, isCurrentUser: true },
    { id: "b", name: "B", shortName: "B", initials: "B", avatarBg: "", avatarFg: "", userId: null, role: "editor" as const, canInvite: true, isCurrentUser: false },
  ];

  it("nets paid minus fair share", () => {
    const budget = computeBudget(members, [
      { id: "e1", description: "dinner", payer: "a", amount: 100, currency: "JPY", participants: ["a", "b"], whenLabel: "", createdOrder: 0 },
    ]);
    expect(budget.total).toBe(100);
    expect(budget.balances.find((x) => x.memberId === "a")!.net).toBe(50);
    expect(budget.balances.find((x) => x.memberId === "b")!.net).toBe(-50);
  });

  it("produces a minimal settlement transferring debtor -> creditor", () => {
    const budget = computeBudget(members, [
      { id: "e1", description: "dinner", payer: "a", amount: 100, currency: "JPY", participants: ["a", "b"], whenLabel: "", createdOrder: 0 },
    ]);
    expect(budget.settlements).toEqual([{ from: "b", to: "a", amount: 50 }]);
  });

  it("matches the seed trip totals", () => {
    const trip = seedTrips()[0]!.snapshot;
    const budget = computeBudget(trip.members, trip.expenses);
    // Sum of all seed expenses.
    expect(budget.total).toBe(351900);
    // Balances net to zero.
    const sum = budget.balances.reduce((n, b) => n + b.net, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(1);
  });
});
