/**
 * Simple token-bucket style limiter for public OSM endpoints
 * (Nominatim / Overpass usage policies).
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillIntervalMs: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.max(10, this.refillIntervalMs - (Date.now() - this.lastRefill));
      await sleep(waitMs);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed < this.refillIntervalMs) return;
    const gained = Math.floor(elapsed / this.refillIntervalMs);
    if (gained <= 0) return;
    this.tokens = Math.min(this.maxTokens, this.tokens + gained);
    this.lastRefill += gained * this.refillIntervalMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
