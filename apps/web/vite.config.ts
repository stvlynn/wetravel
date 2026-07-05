import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { THEME_STORAGE_KEY } from "./src/shared/config/theme";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const baseUrl = process.env.BASE_URL ?? env.BASE_URL ?? "";

  return {
    envDir: repoRoot,
    define: {
      __WETRAVEL_BASE_URL__: JSON.stringify(baseUrl),
      __WETRAVEL_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
      {
        name: "initial-theme",
        transformIndexHtml() {
          return [
            {
              tag: "script",
              children: `try{const mode=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})??"system";const dark=mode==="dark"||(mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark)}catch{}`,
              injectTo: "head-prepend",
            },
          ];
        },
      },
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },
  };
});
