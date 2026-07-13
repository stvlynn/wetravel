import type {
  AuthRateLimitDecision,
  AuthRateLimitStorage,
} from "./auth-rate-limit";
import type { DurableObjectNamespaceLike } from "../cloudflare/durable-object";

async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function unsupportedLegacyOperation(): never {
  throw new Error("Auth rate limiting requires atomic consume");
}

/** Adapts Better Auth's atomic rate-limit contract to a dedicated Durable
 * Object instance per hashed IP-and-path key. */
export function createCloudflareAuthRateLimitStorage(
  namespace: DurableObjectNamespaceLike,
): AuthRateLimitStorage {
  return {
    async get() {
      return unsupportedLegacyOperation();
    },
    async set() {
      unsupportedLegacyOperation();
    },
    async consume(key, rule): Promise<AuthRateLimitDecision> {
      const stub = namespace.getByName(await hashKey(key));
      const response = await stub.fetch(
        new Request("https://auth-rate-limit.internal/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rule),
        }),
      );
      if (!response.ok) {
        throw new Error(`Auth rate limiter returned ${response.status}`);
      }
      return (await response.json()) as AuthRateLimitDecision;
    },
  };
}
