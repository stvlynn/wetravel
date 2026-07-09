/** Deterministic avatar palette so a given user keeps a stable color. */
export const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "var(--avatar-1-bg)", fg: "var(--avatar-1-fg)" },
  { bg: "var(--avatar-2-bg)", fg: "var(--avatar-2-fg)" },
  { bg: "var(--avatar-3-bg)", fg: "var(--avatar-3-fg)" },
  { bg: "var(--avatar-4-bg)", fg: "var(--avatar-4-fg)" },
  { bg: "var(--avatar-5-bg)", fg: "var(--avatar-5-fg)" },
];

export function avatarHashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/**
 * Vercel-style gradient avatar generator (github.com/vercel/avatar): a
 * deterministic two-tone diagonal gradient derived from a seed string. The
 * output is a tiny, self-contained SVG so it can be persisted verbatim ("static
 * in the database") and rendered as a plain static image everywhere.
 *
 * The `dither` variant overlays an ordered (Bayer-style) stipple so the agent's
 * avatar reads as a distinct, textured version of the same gradient family.
 */

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

const SIZE = 128;

/** Build the deterministic gradient SVG string for a seed. */
export function gradientAvatarSvg(
  seed: string,
  { dither = false }: { dither?: boolean } = {},
): string {
  const [start, end] = gradientStops(seed);
  const ditherLayer = dither
    ? `<pattern id="d" width="4" height="4" patternUnits="userSpaceOnUse">` +
      `<circle cx="1" cy="1" r="0.7" fill="#000" fill-opacity="0.22"/>` +
      `<circle cx="3" cy="3" r="0.7" fill="#fff" fill-opacity="0.14"/>` +
      `</pattern>`
    : "";
  const ditherRect = dither
    ? `<rect width="${SIZE}" height="${SIZE}" fill="url(#d)"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${start}"/>` +
    `<stop offset="100%" stop-color="${end}"/>` +
    `</linearGradient>` +
    ditherLayer +
    `</defs>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>` +
    ditherRect +
    `</svg>`
  );
}

/** Encode an SVG string as a stable, static data URI. */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const urlCache = new Map<string, string>();

/** Deterministic vercel-style gradient avatar data URI for an identity `seed`. */
export function gradientAvatarUrl(seed: string): string {
  const key = `plain:${seed}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const url = svgDataUri(gradientAvatarSvg(seed));
  urlCache.set(key, url);
  return url;
}

/** Fixed seed for the AI agent so its avatar is identical across every trip. */
export const AGENT_AVATAR_SEED = "opentrip-agent";

/** Gradient avatar with an extra dither layer, used for the AI agent. */
export function agentAvatarUrl(seed: string = AGENT_AVATAR_SEED): string {
  const key = `dither:${seed}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const url = svgDataUri(gradientAvatarSvg(seed, { dither: true }));
  urlCache.set(key, url);
  return url;
}
