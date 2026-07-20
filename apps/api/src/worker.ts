import { createContainer } from "./infrastructure/composition/container";
import { loadConfig, type RawEnv } from "./infrastructure/config";
import { createWorkerStorage } from "./infrastructure/storage/create-worker-storage";
import type { R2BucketLike } from "./infrastructure/storage/r2-storage";
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
import * as Sentry from "@sentry/cloudflare";
import {
  captureException,
  logger,
  registerAiTelemetry,
  sanitizeSpan,
  setErrorReporter,
  setRuntimeName,
} from "./infrastructure/observability";
import {
  CloudflareStreetViewCache,
  type CloudflareCacheLike,
} from "./infrastructure/street-view/cloudflare-street-view-cache";

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
  R2_FILE_STORAGE?: R2BucketLike;
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

function defaultWorkerCache(): CloudflareCacheLike {
  return (
    globalThis as typeof globalThis & {
      caches: { default: CloudflareCacheLike };
    }
  ).caches.default;
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
    createWorkerStorage(config.storage, env.R2_FILE_STORAGE),
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
      streetViewCache: new CloudflareStreetViewCache(
        defaultWorkerCache(),
        config.streetView?.provider ?? "mapillary",
      ),
    },
  );
  return {
    app: createApp(container, {
      runtime: "cloudflare",
      setRequestContext: ({ requestId }) => {
        Sentry.setTag("request.id", requestId);
      },
    }),
    container,
  };
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
    "cache-control": "private, no-store",
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

const worker = {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext,
  ): Promise<Response> {
    if (
      env.HYPERDRIVE?.connectionString?.trim() &&
      !env.HYPERDRIVE_CACHE_DISABLED?.connectionString?.trim()
    ) {
      logger.error("worker.hyperdrive_fresh_binding_missing", {
        runtime: "cloudflare",
        message: "HYPERDRIVE_CACHE_DISABLED is required",
      });
      return emergencyCorsResponse(
        request,
        env,
        503,
        "Database consistency binding is not configured",
      );
    }
    if (!env.AUTH_RATE_LIMIT) {
      logger.error("worker.auth_rate_limit_binding_missing", { runtime: "cloudflare" });
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
      logger.error("worker.fetch_failed", { runtime: "cloudflare", error: err });
      captureException(err, { runtime: "cloudflare" });
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
          logger.error("worker.pool_dispose_failed", {
            runtime: "cloudflare",
            error: err,
          });
          captureException(err, { runtime: "cloudflare" });
        }),
      );
    }
  },
};

setRuntimeName("cloudflare");
registerAiTelemetry();

export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || "production",
    release: env.SENTRY_RELEASE,
    enableLogs: true,
    tracesSampler: ({ name }) => {
      if (name.includes("/health")) return 0;
      if (/\/api\/trips\/[^/]+\/agent\//.test(name)) return 1;
      return 0.1;
    },
    beforeSendSpan: (span) => sanitizeSpan(span),
    beforeSend: (event) => {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.url) event.request.url = event.request.url.split("?")[0];
      }
      return event;
    },
  }),
  {
    ...worker,
    async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
      setErrorReporter((error, fields) => {
        Sentry.withScope((scope) => {
          if (fields) scope.setContext("opentrip", fields);
          Sentry.captureException(error);
        });
      });
      return worker.fetch(request, env, ctx);
    },
  },
);

export { AuthRateLimitObject, TripRealtimeObject };
