import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { THEME_STORAGE_KEY } from "./src/shared/config/theme";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packageJson = JSON.parse(
    readFileSync(
        fileURLToPath(new URL("./package.json", import.meta.url)),
        "utf8",
    ),
) as { version: string };

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, repoRoot, "");
    const baseUrl = process.env.BASE_URL ?? env.BASE_URL ?? "";
    const webPort = Number(env.WEB_PORT ?? process.env.WEB_PORT ?? 5170);
    const apiPort = Number(env.PORT ?? process.env.PORT ?? 8780);
    const captchaProvider =
        env.CAPTCHA_PROVIDER ?? process.env.CAPTCHA_PROVIDER ?? "";
    const turnstileSiteKey =
        env.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY ?? "";

    return {
        envDir: repoRoot,
        define: {
            __WETRAVEL_BASE_URL__: JSON.stringify(baseUrl),
            __WETRAVEL_VERSION__: JSON.stringify(packageJson.version),
            __WETRAVEL_CAPTCHA_PROVIDER__: JSON.stringify(captchaProvider),
            __WETRAVEL_TURNSTILE_SITE_KEY__: JSON.stringify(turnstileSiteKey),
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
            port: webPort,
            strictPort: true,
            proxy: {
                "/api": {
                    target: `http://localhost:${apiPort}`,
                    changeOrigin: true,
                },
            },
        },
    };
});
