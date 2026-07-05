import { serve } from "@hono/node-server";
import { createContainer } from "./infrastructure/composition/container";
import { loadConfig } from "./infrastructure/config";
import { createNodeStorage } from "./infrastructure/storage/create-node-storage";
import { createApp } from "./interfaces/http/app";

const config = loadConfig(process.env);
const container = createContainer(config, createNodeStorage(config.storage));
const app = createApp(container);
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
