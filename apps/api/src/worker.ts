import { createContainer } from "./infrastructure/composition/container";
import { loadConfig, type RawEnv } from "./infrastructure/config";
import { createWorkerStorage } from "./infrastructure/storage/create-worker-storage";
import { createApp } from "./interfaces/http/app";
import {
  AuthRateLimitObject,
  createCloudflareAuthRateLimitStorage,
} from "./infrastructure/auth";
import {
  CloudflareTripChangePublisher,
  signRealtimeGrant,
  TripRealtimeObject,
  type DurableObjectNamespaceLike,
} from "./infrastructure/realtime";

interface WorkerEnv extends RawEnv {
  /** Optional Hyperdrive binding (query cache enabled). Prefer when available. */
  HYPERDRIVE?: { connectionString: string };
  /**
   * Cache-disabled Hyperdrive for consistency-critical business repositories.
   * Required whenever the cached Hyperdrive binding is configured.
   */
  HYPERDRIVE_CACHE_DISABLED?: { connectionString: string };
  /** Required when HYPERDRIVE is not bound (direct MySQL/Postgres). */
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET: string;
  TRUSTED_ORIGINS?: string;
  BASE_URL?: string;
  TRIP_REALTIME: DurableObjectNamespaceLike;
  AUTH_RATE_LIMIT: DurableObjectNamespaceLike;
  REALTIME_GRANT_SECRET: string;
}

/** Minimal ExecutionContext so we do not depend on ambient Workers types. */
interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function resolveConnectionString(env: WorkerEnv): string | undefined {
  const fromHyperdrive = env.HYPERDRIVE?.connectionString?.trim();
  if (fromHyperdrive) return fromHyperdrive;
  return env.DATABASE_URL?.trim() || undefined;
}

function resolveFreshConnectionString(
  env: WorkerEnv,
  cached: string | undefined,
): string | undefined {
  const fromFresh = env.HYPERDRIVE_CACHE_DISABLED?.connectionString?.trim();
  if (fromFresh) return fromFresh;
  return cached;
}

function buildApp(env: WorkerEnv, ctx: WorkerExecutionContext) {
  const connectionString = resolveConnectionString(env);
  const freshDatabaseUrl = resolveFreshConnectionString(env, connectionString);
  const config = loadConfig(env, connectionString);
  const dualPools =
    Boolean(freshDatabaseUrl) &&
    freshDatabaseUrl !== config.databaseUrl.trim();
  // Keep total per-request client slots ≤ 5 when both Hyperdrive bindings are live.
  const container = createContainer(
    config,
    createWorkerStorage(config.storage),
    {
      poolMax: dualPools ? 3 : 5,
      poolMaxFresh: 2,
      freshDatabaseUrl,
      tripChangePublisher: new CloudflareTripChangePublisher(
        env.TRIP_REALTIME,
        env.REALTIME_GRANT_SECRET,
        (task) => ctx.waitUntil(task),
      ),
      authRateLimitStorage: createCloudflareAuthRateLimitStorage(
        env.AUTH_RATE_LIMIT,
      ),
      // Cloudflare sets and protects this edge-derived header. Do not trust
      // browser-controlled forwarding chains when partitioning auth limits.
      authIpAddressHeaders: ["cf-connecting-ip"],
    },
  );
  return { app: createApp(container), container };
}

export async function handleRealtimeUpgrade(
  request: Request,
  env: WorkerEnv,
  container: ReturnType<typeof buildApp>["container"],
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/trips\/([^/]+)\/realtime$/);
  if (!match) return null;
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  const origin = request.headers.get("Origin") ?? "";
  if (!origin || !container.config.trustedOrigins.includes(origin)) {
    return new Response("Untrusted origin", { status: 403 });
  }
  const session = await container.auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Sign in required", { status: 401 });

  const tripId = decodeURIComponent(match[1]!);
  let trip;
  try {
    trip = await container.tripService.getTrip(tripId, session.user.id);
  } catch {
    return new Response("Trip not found", { status: 404 });
  }
  const member =
    trip.members.find((candidate) => candidate.userId === session.user.id) ??
    trip.members.find((candidate) => candidate.isCurrentUser);
  if (!member) return new Response("Trip not found", { status: 404 });

  const grant = await signRealtimeGrant(
    {
      connectionId: crypto.randomUUID(),
      tripId,
      userId: session.user.id,
      name: session.user.name || session.user.email,
      image: session.user.image ?? null,
      role: member.role,
    },
    env.REALTIME_GRANT_SECRET,
  );
  const internalUrl = new URL("https://trip-realtime.internal/connect");
  internalUrl.searchParams.set("tripId", tripId);
  return env.TRIP_REALTIME.getByName(tripId).fetch(
    new Request(internalUrl, {
      headers: {
        Authorization: `Bearer ${grant}`,
        Upgrade: "websocket",
      },
    }),
  );
}

/**
 * Platform-level failures (uncaught throws, hung isolate recovery) return CF
 * 1101 **without** CORS headers — the browser reports "blocked by CORS".
 * Mirror trusted-origin CORS on emergency JSON so the SPA sees a real error.
 */
function emergencyCorsResponse(
  request: Request,
  env: WorkerEnv,
  status: number,
  message: string,
): Response {
  const origin = request.headers.get("Origin") ?? "";
  const trusted = (env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const headers = new Headers({
    "content-type": "application/json",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && trusted.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  return new Response(
    JSON.stringify({ error: { code: "internal_error", message } }),
    { status, headers },
  );
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext,
  ): Promise<Response> {
    if (
      env.HYPERDRIVE?.connectionString?.trim() &&
      !env.HYPERDRIVE_CACHE_DISABLED?.connectionString?.trim()
    ) {
      console.error(
        "HYPERDRIVE_CACHE_DISABLED is required when cached Hyperdrive is configured",
      );
      return emergencyCorsResponse(
        request,
        env,
        503,
        "Database consistency binding is not configured",
      );
    }
    if (!env.AUTH_RATE_LIMIT) {
      console.error("AUTH_RATE_LIMIT Durable Object binding is required");
      return emergencyCorsResponse(
        request,
        env,
        503,
        "Authentication rate limiter is not configured",
      );
    }
    // Always build a fresh client pool per request on Workers.
    // Hyperdrive still pools TCP to the origin at the edge; caching a
    // node-postgres Pool across isolate freezes left connections "pending"
    // forever → CF hang cancel (1101) which browsers report as CORS.
    const { app, container } = buildApp(env, ctx);
    try {
      const realtime = await handleRealtimeUpgrade(request, env, container);
      if (realtime) return realtime;
      return await app.fetch(request);
    } catch (err) {
      console.error("Worker fetch failed:", err);
      return emergencyCorsResponse(
        request,
        env,
        500,
        "Something went wrong",
      );
    } finally {
      // Dispose only after deferred work finishes (ambient replies + streaming
      // chat onFinish persistence) so we do not race pool.end() against
      // SqlAgentSessionRepository.appendMessage.
      ctx.waitUntil(
        container.disposeAfterDeferred().catch((err) => {
          console.error("Failed to dispose DB pools:", err);
        }),
      );
    }
  },
};

export { AuthRateLimitObject, TripRealtimeObject };
