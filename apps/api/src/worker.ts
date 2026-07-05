import { createContainer, type Container } from "./infrastructure/composition/container";
import { loadConfig, type RawEnv } from "./infrastructure/config";
import { createWorkerStorage } from "./infrastructure/storage/create-worker-storage";
import { createApp } from "./interfaces/http/app";

interface WorkerEnv extends RawEnv {
  HYPERDRIVE: { connectionString: string };
  BETTER_AUTH_SECRET: string;
}

let cached: { app: ReturnType<typeof createApp>; container: Container } | null =
  null;

function getApp(env: WorkerEnv) {
  if (!cached) {
    const config = loadConfig(env, env.HYPERDRIVE.connectionString);
    const container = createContainer(config, createWorkerStorage(config.storage));
    cached = { app: createApp(container), container };
  }
  return cached.app;
}

export default {
  fetch(request: Request, env: WorkerEnv): Response | Promise<Response> {
    return getApp(env).fetch(request);
  },
};
