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
}

let cached: { app: ReturnType<typeof createApp>; container: Container } | null =
  null;

function resolveConnectionString(env: WorkerEnv): string | undefined {
  const fromHyperdrive = env.HYPERDRIVE?.connectionString?.trim();
  if (fromHyperdrive) return fromHyperdrive;
  return env.DATABASE_URL?.trim() || undefined;
}

function getApp(env: WorkerEnv) {
  if (!cached) {
    const connectionString = resolveConnectionString(env);
    const config = loadConfig(env, connectionString);
    const container = createContainer(
      config,
      createWorkerStorage(config.storage),
    );
    cached = { app: createApp(container), container };
  }
  return cached.app;
}

export default {
  fetch(request: Request, env: WorkerEnv): Response | Promise<Response> {
    return getApp(env).fetch(request);
  },
};
