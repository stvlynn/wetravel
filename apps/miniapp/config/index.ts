import "dotenv/config";
import path from "node:path";
import { defineConfig } from "@tarojs/cli";

export default defineConfig({
  projectName: "OpenTrip Mini Program",
  date: "2026-07-14",
  designWidth: 750,
  deviceRatio: {
    750: 1,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  cache: { enable: true },
  alias: {
    "@": path.resolve(__dirname, "..", "src"),
  },
  env: {
    TARO_APP_API_BASE_URL: JSON.stringify(
      process.env.TARO_APP_API_BASE_URL ?? "",
    ),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false },
    },
  },
});
