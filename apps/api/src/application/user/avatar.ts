/**
 * Vercel-style gradient avatar generator (github.com/vercel/avatar).
 *
 * Produces a deterministic two-tone diagonal gradient SVG from a seed string,
 * encoded as a small static data URI so it can be persisted verbatim in the
 * database ("static in the database") and served as a plain image.
 *
 * This mirrors the frontend generator in
 * `apps/web/src/shared/lib/avatar.ts`. The two must stay in sync; there is no
 * shared workspace package to host a single copy, so the algorithm is kept
 * intentionally small and identical on both sides.
 */

const SIZE = 128;

/** djb2-style string hash, matching the gradient-avatar reference. */
function hashOfString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalize(hash: number, min: number, max: number): number {
  return Math.floor((hash % (max - min)) + min);
}

/** Two HSL stops for a vivid diagonal gradient, both from the same hash. */
function gradientStops(seed: string): [string, string] {
  const hash = hashOfString(seed);
  const h = normalize(hash, 0, 360);
  const s = normalize(hash, 62, 82);
  const l = normalize(hash, 46, 62);
  const start = `hsl(${h}, ${s}%, ${l}%)`;
  const end = `hsl(${(h + 64) % 360}, ${s}%, ${Math.max(l - 16, 24)}%)`;
  return [start, end];
}

/** Build the deterministic gradient SVG string for a seed. */
export function gradientAvatarSvg(seed: string): string {
  const [start, end] = gradientStops(seed);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${start}"/>` +
    `<stop offset="100%" stop-color="${end}"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>` +
    `</svg>`
  );
}

/** Deterministic gradient avatar data URI for an identity `seed`. */
export function gradientAvatarUrl(seed: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(gradientAvatarSvg(seed))}`;
}
