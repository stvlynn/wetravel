import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRateLimitObject } from "../src/infrastructure/auth";
import type { AuthRateLimitDecision } from "../src/infrastructure/auth";

interface StoredCounter {
  count: number;
  resetAt: number;
}

class FakeDurableStorage {
  private readonly values = new Map<string, unknown>();
  private transactionQueue: Promise<unknown> = Promise.resolve();
  alarmAt: number | Date | null = null;

  transaction<T>(
    callback: (transaction: FakeDurableStorage) => Promise<T>,
  ): Promise<T> {
    const result = this.transactionQueue.then(() => callback(this));
    this.transactionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarmAt = scheduledTime;
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
  }

  counter(): StoredCounter | undefined {
    return this.values.get("counter") as StoredCounter | undefined;
  }
}

function consume(object: AuthRateLimitObject, window = 60, max = 3) {
  return object.fetch(
    new Request("https://auth-rate-limit.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ window, max }),
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AuthRateLimitObject", () => {
  it("atomically enforces one global fixed window under concurrency", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    const storage = new FakeDurableStorage();
    const object = new AuthRateLimitObject({ storage });

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => consume(object)),
    );
    const decisions = await Promise.all(
      responses.map(
        async (response) => (await response.json()) as AuthRateLimitDecision,
      ),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(3);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(5);
    expect(storage.counter()?.count).toBe(3);
    expect(storage.alarmAt).toBe(Date.now() + 60_000);
  });

  it("resets expired windows and clears durable state on alarm", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    const storage = new FakeDurableStorage();
    const object = new AuthRateLimitObject({ storage });

    await consume(object, 10, 1);
    const denied = await consume(object, 10, 1);
    await expect(denied.json()).resolves.toEqual({
      allowed: false,
      retryAfter: 10,
    });

    vi.advanceTimersByTime(10_001);
    const reset = await consume(object, 10, 1);
    await expect(reset.json()).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });

    vi.advanceTimersByTime(10_001);
    await object.alarm();
    expect(storage.counter()).toBeUndefined();
  });

  it("does not let a stale alarm delete an active window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    const storage = new FakeDurableStorage();
    const object = new AuthRateLimitObject({ storage });

    await consume(object, 60, 3);
    await object.alarm();

    expect(storage.counter()?.count).toBe(1);
    expect(storage.alarmAt).toBe(Date.now() + 60_000);
  });

  it("rejects malformed rules", async () => {
    const object = new AuthRateLimitObject({ storage: new FakeDurableStorage() });
    const response = await object.fetch(
      new Request("https://auth-rate-limit.internal/consume", {
        method: "POST",
        body: JSON.stringify({ window: 0, max: 3 }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
