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
    expect(s.days[0]!.dateLabel).toBe("");
    expect(s.members).toEqual([
      expect.objectContaining({ id: "u1", initials: "AL", isCurrentUser: true }),
    ]);
    expect(trip.currentMemberId()).toBe("u1");
  });

  it("appends a new empty day with the next number and a cycled color", () => {
    const trip = Trip.create({ title: "Kyoto" }, { id: "u1", name: "Ada" });
    const day = trip.addDay();
    expect(day.number).toBe(2);
    expect(day.dateLabel).toBe("");
    expect(day.color).not.toBe(trip.toSnapshot().days[0]!.color);
    expect(trip.toSnapshot().days).toHaveLength(2);
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

describe("computeBudget", () => {
  const members = [
    { id: "a", name: "A", shortName: "A", initials: "A", avatarBg: "", avatarFg: "", isCurrentUser: true },
    { id: "b", name: "B", shortName: "B", initials: "B", avatarBg: "", avatarFg: "", isCurrentUser: false },
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
