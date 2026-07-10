import { createContainer, type Container } from "./infrastructure/composition/container";
import { loadConfig, type RawEnv } from "./infrastructure/config";
import { createWorkerStorage } from "./infrastructure/storage/create-worker-storage";
import { createApp } from "./interfaces/http/app";

interface WorkerEnv extends RawEnv {
  /** Optional Hyperdrive binding. Prefer when available (pooling). */
  HYPERDRIVE?: { connectionString: string };
  /** Required when HYPERDRIVE is not bound (direct MySQL/Postgres). */
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET: string;
  TRUSTED_ORIGINS?: string;
  BASE_URL?: string;
}

/** Minimal ExecutionContext so we do not depend on ambient Workers types. */
interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Only cache when Hyperdrive owns the socket lifecycle. */
let hyperdriveCached: {
  app: ReturnType<typeof createApp>;
  container: Container;
} | null = null;

function resolveConnectionString(env: WorkerEnv): string | undefined {
  const fromHyperdrive = env.HYPERDRIVE?.connectionString?.trim();
  if (fromHyperdrive) return fromHyperdrive;
  return env.DATABASE_URL?.trim() || undefined;
}

function hasHyperdrive(env: WorkerEnv): boolean {
  return Boolean(env.HYPERDRIVE?.connectionString?.trim());
}

function buildApp(env: WorkerEnv, poolMax: number) {
  const connectionString = resolveConnectionString(env);
  const config = loadConfig(env, connectionString);
  const container = createContainer(
    config,
    createWorkerStorage(config.storage),
    { poolMax },
  );
  return { app: createApp(container), container };
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
    try {
      // Hyperdrive: long-lived **shared** client pool (max small; Hyperdrive
      // pools at the edge). Avoid dual pools — see createDatabaseHandles.
      if (hasHyperdrive(env)) {
        if (!hyperdriveCached) {
          // max 5 is CF's node-postgres example; we share one pool for auth+SQL.
          hyperdriveCached = buildApp(env, 5);
        }
        return await hyperdriveCached.app.fetch(request);
      }

      // Direct MySQL/Postgres: Workers freeze isolates and close TCP sockets.
      // A cached mysql2 pool then fails with
      // "Can't add new command when connection is in closed state".
      // Build a fresh pool per request and dispose after the response.
      const { app, container } = buildApp(env, 1);
      try {
        return await app.fetch(request);
      } finally {
        ctx.waitUntil(
          container.dispose().catch((err) => {
            console.error("Failed to dispose DB pools:", err);
          }),
        );
      }
    } catch (err) {
      console.error("Worker fetch failed:", err);
      // Drop broken Hyperdrive cache so the next request rebuilds pools.
      hyperdriveCached = null;
      return emergencyCorsResponse(
        request,
        env,
        500,
        "Something went wrong",
      );
    }
  },
};
