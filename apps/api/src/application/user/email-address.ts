const INTERNAL_EMAIL_SUFFIXES = [".invalid", ".local"] as const;

/** Normalize user-provided email for identity and uniqueness comparisons. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Internal compatibility addresses must never reach an outbound mail adapter. */
export function isInternalEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const domain = normalized.split("@").at(-1) ?? "";
  return INTERNAL_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/** Return a contact address only when it is real and independently verified. */
export function deliverableEmail(user: {
  email: string;
  emailVerified: boolean;
  emailIsPlaceholder?: boolean | null;
}): string | null {
  if (
    user.emailIsPlaceholder ||
    !user.emailVerified ||
    isInternalEmail(user.email)
  ) {
    return null;
  }
  return normalizeEmail(user.email);
}

/** Better Auth currently requires an email even when WeChat provides none. */
export function placeholderEmailForUser(userId: string): string {
  return `wechat+${userId}@identity.invalid`;
}
