#!/usr/bin/env node
// Derives platform sizes from the image-generated master artwork. Run
// `pnpm --filter @opentrip/web icons:generate` after replacing the master and
// commit the regenerated PNGs / favicon.
import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

const targets = [
  { out: "favicon-32x32.png", size: 32 },
  { out: "apple-touch-icon-180x180.png", size: 180 },
  { out: "pwa-192x192.png", size: 192 },
  { out: "pwa-512x512.png", size: 512 },
  { out: "pwa-maskable-512x512.png", size: 512 },
];

/** Pack a PNG into a single-entry ICO (PNG-compressed, Vista+). */
function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = 32; // width
  entry[1] = 32; // height
  entry[2] = 0; // color palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([header, entry, png]);
}

const master = await readFile(join(publicDir, "app-icon-master.png"));

let faviconPng = null;

for (const { out, size } of targets) {
  const image = sharp(master).resize(size, size, { fit: "cover" }).flatten({ background: "#fafbfd" });
  const png = await image.png().toBuffer();
  await writeFile(join(publicDir, out), png);
  console.log(`wrote public/${out} (${size}x${size})`);
  if (out === "favicon-32x32.png") faviconPng = png;
}

if (!faviconPng) {
  throw new Error("favicon-32x32.png was not generated");
}

await writeFile(join(publicDir, "favicon.ico"), pngToIco(faviconPng));
console.log("wrote public/favicon.ico (32x32)");
