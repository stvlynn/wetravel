declare const __WETRAVEL_BASE_URL__: string;
declare const __WETRAVEL_VERSION__: string;
declare const __WETRAVEL_CAPTCHA_PROVIDER__: string;
declare const __WETRAVEL_TURNSTILE_SITE_KEY__: string;

function requireBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) {
    throw new Error("BASE_URL is required. Set it in the root .env file.");
  }

  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BASE_URL must start with http:// or https://.");
  }

  return url.origin;
}

export type CaptchaProvider =
  | ""
  | "cloudflare-turnstile"
  | "google-recaptcha"
  | "hcaptcha"
  | "captchafox";

/** Runtime configuration injected from the root `.env` by Vite. */
export const config = {
  /** Public origin for API/auth calls. */
  baseUrl: requireBaseUrl(__WETRAVEL_BASE_URL__),
  version: __WETRAVEL_VERSION__,
  captchaProvider: __WETRAVEL_CAPTCHA_PROVIDER__ as CaptchaProvider,
  turnstileSiteKey: __WETRAVEL_TURNSTILE_SITE_KEY__,
} as const;

/** React Query keys, centralized to avoid string drift. */
export const queryKeys = {
  trips: ["trips"] as const,
  trip: (id: string) => ["trips", id] as const,
  session: ["session"] as const,
  preferences: ["preferences"] as const,
};
