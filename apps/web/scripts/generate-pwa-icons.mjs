#!/usr/bin/env node
// Rasterizes the committed SVG app icons into the PNG set required by
// installers that do not accept SVG (iOS apple-touch-icon, most Android
// launchers). Run `pnpm --filter @opentrip/web icons:generate` after editing
// the SVGs and commit the regenerated PNGs.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

const targets = [
  // Full-bleed source: iOS applies its own corner mask and dislikes alpha.
  { src: "pwa-maskable-512x512.svg", out: "apple-touch-icon-180x180.png", size: 180, flatten: true },
  { src: "pwa-192x192.svg", out: "pwa-192x192.png", size: 192 },
  { src: "pwa-512x512.svg", out: "pwa-512x512.png", size: 512 },
  { src: "pwa-maskable-512x512.svg", out: "pwa-maskable-512x512.png", size: 512 },
];

for (const { src, out, size, flatten } of targets) {
  const svg = await readFile(join(publicDir, src));
  let image = sharp(svg, { density: 300 }).resize(size, size);
  if (flatten) image = image.flatten({ background: "#173f35" });
  await writeFile(join(publicDir, out), await image.png().toBuffer());
  console.log(`wrote public/${out} (${size}x${size})`);
}
