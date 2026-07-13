import type {
  TripChange,
  TripChangePublisher,
} from "../../domain/realtime";
import type { DurableObjectNamespaceLike } from "../cloudflare/durable-object";

export type {
  DurableObjectNamespaceLike,
  DurableObjectStubLike,
} from "../cloudflare/durable-object";

export type RealtimeDefer = (task: Promise<unknown>) => void;

/** Publishes after commit without extending mutation latency. Retry work is
 * attached to the Worker request through ExecutionContext.waitUntil. */
export class CloudflareTripChangePublisher implements TripChangePublisher {
  constructor(
    private readonly namespace: DurableObjectNamespaceLike,
    private readonly secret: string,
    private readonly defer: RealtimeDefer,
  ) {}

  async publish(change: TripChange): Promise<void> {
    this.defer(this.publishWithRetry(change));
  }

  private async publishWithRetry(change: TripChange): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const stub = this.namespace.getByName(change.tripId);
        const url = new URL("https://trip-realtime.internal/publish");
        url.searchParams.set("tripId", change.tripId);
        const response = await stub.fetch(
          new Request(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-OpenTrip-Realtime-Secret": this.secret,
            },
            body: JSON.stringify(change),
          }),
        );
        if (!response.ok) {
          throw new Error(`Realtime publish returned ${response.status}`);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await delay(50 * 2 ** attempt);
      }
    }
    console.error("Realtime publish exhausted retries", {
      tripId: change.tripId,
      eventId: change.eventId,
      error: lastError,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
