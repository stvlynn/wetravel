/** Locales supported by transactional email copy (mirrors SPA i18n). */
export const EMAIL_LOCALES = ["en", "zh"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const DEFAULT_EMAIL_LOCALE: EmailLocale = "en";

/** Client header carrying the SPA language (`opentrip-lang` / i18next). */
export const EMAIL_LANG_HEADER = "x-opentrip-lang";

function isEmailLocale(value: string): value is EmailLocale {
  return (EMAIL_LOCALES as readonly string[]).includes(value);
}

/** Normalize tags like `zh-CN` / `en-US` → `zh` / `en`. */
export function normalizeEmailLocale(raw: string | null | undefined): EmailLocale {
  if (!raw) return DEFAULT_EMAIL_LOCALE;
  const primary = raw.trim().toLowerCase().split(/[_-]/)[0] ?? "";
  return isEmailLocale(primary) ? primary : DEFAULT_EMAIL_LOCALE;
}

/**
 * Resolve mail locale: explicit `x-opentrip-lang` first, then Accept-Language,
 * then English. Prefer the SPA header so inbox language matches the UI the
 * user was using when they triggered the mail.
 */
export function resolveEmailLocale(headers: Headers | null | undefined): EmailLocale {
  if (!headers) return DEFAULT_EMAIL_LOCALE;
  const explicit = headers.get(EMAIL_LANG_HEADER);
  if (explicit) return normalizeEmailLocale(explicit);

  const accept = headers.get("accept-language");
  if (!accept) return DEFAULT_EMAIL_LOCALE;
  for (const part of accept.split(",")) {
    const tag = part.trim().split(";")[0];
    if (!tag) continue;
    const primary = tag.trim().toLowerCase().split(/[_-]/)[0] ?? "";
    if (isEmailLocale(primary)) return primary;
  }
  return DEFAULT_EMAIL_LOCALE;
}

export function localeFromRequest(
  request: Request | null | undefined,
): EmailLocale {
  return resolveEmailLocale(request?.headers ?? null);
}

/** Better Auth OTP callback passes endpoint ctx; pull Request from it. */
export function localeFromAuthContext(ctx: unknown): EmailLocale {
  if (!ctx || typeof ctx !== "object") return DEFAULT_EMAIL_LOCALE;
  const request = (ctx as { request?: Request }).request;
  return localeFromRequest(request ?? null);
}
