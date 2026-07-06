import { createPlanetAvatar } from "planet-avatar";

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

const planetUrlCache = new Map<string, string>();

/** Deterministic planet-style avatar URL for a given identity `seed`.
 *
 * The generated SVG is large (~260KB), so it is created once per seed and
 * shared through a cached blob URL. Repeated avatars for the same user then
 * reference one object instead of duplicating the SVG throughout the DOM. */
export function planetAvatarUrl(seed: string): string {
  const cached = planetUrlCache.get(seed);
  if (cached) return cached;
  const svg = createPlanetAvatar({ seed, size: 128 });
  const url =
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
      : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  planetUrlCache.set(seed, url);
  return url;
}


