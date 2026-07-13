import type {
  AuthRateLimitDecision,
  AuthRateLimitRule,
} from "./auth-rate-limit";

const COUNTER_KEY = "counter";

interface CounterRecord {
  count: number;
  resetAt: number;
}

interface DurableTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  transaction<T>(
    callback: (transaction: DurableTransaction) => Promise<T>,
  ): Promise<T>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAll(): Promise<void>;
}

interface DurableObjectStateLike {
  readonly storage: DurableStorage;
}

function isRateLimitRule(value: unknown): value is AuthRateLimitRule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthRateLimitRule>;
  return (
    Number.isInteger(candidate.window) &&
    Number.isInteger(candidate.max) &&
    (candidate.window ?? 0) > 0 &&
    (candidate.max ?? 0) > 0
  );
}

/** Globally consistent fixed-window limiter. One object instance owns exactly
 * one hashed Better Auth rate-limit key. */
export class AuthRateLimitObject {
  constructor(private readonly ctx: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let rule: unknown;
    try {
      rule = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (!isRateLimitRule(rule)) {
      return new Response("Invalid rate-limit rule", { status: 400 });
    }

    const decision = await this.ctx.storage.transaction(async (transaction) => {
      const now = Date.now();
      const current = await transaction.get<CounterRecord>(COUNTER_KEY);
      if (!current || now >= current.resetAt) {
        const next: CounterRecord = {
          count: 1,
          resetAt: now + rule.window * 1_000,
        };
        await transaction.put(COUNTER_KEY, next);
        return {
          decision: { allowed: true, retryAfter: null },
          resetAt: next.resetAt,
        } satisfies {
          decision: AuthRateLimitDecision;
          resetAt: number;
        };
      }

      if (current.count >= rule.max) {
        return {
          decision: {
            allowed: false,
            retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
          },
          resetAt: current.resetAt,
        } satisfies {
          decision: AuthRateLimitDecision;
          resetAt: number;
        };
      }

      await transaction.put(COUNTER_KEY, {
        ...current,
        count: current.count + 1,
      });
      return {
        decision: { allowed: true, retryAfter: null },
        resetAt: current.resetAt,
      } satisfies {
        decision: AuthRateLimitDecision;
        resetAt: number;
      };
    });

    await this.ctx.storage.setAlarm(decision.resetAt);
    return Response.json(decision.decision);
  }

  async alarm(): Promise<void> {
    const current = await this.ctx.storage.get<CounterRecord>(COUNTER_KEY);
    if (!current) return;
    if (Date.now() >= current.resetAt) {
      await this.ctx.storage.deleteAll();
      return;
    }
    // A previously scheduled alarm may already be queued when a new window is
    // stored. Preserve the active counter and point cleanup at its reset time.
    await this.ctx.storage.setAlarm(current.resetAt);
  }
}
