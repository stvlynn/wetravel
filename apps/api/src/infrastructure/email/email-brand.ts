/**
 * OpenTrip email brand tokens — hex mirrors of web `colors.css` semantic
 * ramps so transactional mail matches the SPA without shipping CSS vars
 * (most clients strip or ignore custom properties).
 *
 * Visual language: silver-white canvas, navy ink primary, cornflower used
 * sparingly (accent rule / brand moment). Inspired by Mobbin refs
 * (Heidi / Vercel / Visitors OTP) and React Email’s Container + Section
 * composition — but rendered as table HTML for client compatibility on
 * Workers (no React Email runtime).
 */
export const EMAIL_BRAND = {
  background: "#fafbfd",
  card: "#ffffff",
  foreground: "#28304a",
  muted: "#6d788f",
  border: "#dde2ee",
  primary: "#28304a",
  primaryForeground: "#fafbfd",
  brand: "#3f6fc9",
  brandMuted: "#eff3fd",
  radius: "10px",
  fontSans:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  maxWidth: 480,
  siteUrl: "https://opentrip.im",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
