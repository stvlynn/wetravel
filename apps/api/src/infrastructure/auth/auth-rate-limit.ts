export interface AuthRateLimitValue {
  key: string;
  count: number;
  lastRequest: number;
}

export interface AuthRateLimitRule {
  window: number;
  max: number;
}

export interface AuthRateLimitDecision {
  allowed: boolean;
  retryAfter: number | null;
}

/** Better Auth 1.6 rate-limit storage contract. Enforcement must use the
 * atomic `consume` operation; get/set only exist for type compatibility. */
export interface AuthRateLimitStorage {
  get(key: string): Promise<AuthRateLimitValue | null | undefined>;
  set(
    key: string,
    value: AuthRateLimitValue,
    update?: boolean,
  ): Promise<void>;
  consume(
    key: string,
    rule: AuthRateLimitRule,
  ): Promise<AuthRateLimitDecision>;
}
