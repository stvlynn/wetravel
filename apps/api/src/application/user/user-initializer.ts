import type { OAuthProfileDto } from "./oauth-profile";

/** Default avatar for users created with email/password. */
export const DEFAULT_AVATAR_URL =
  "https://planet-avatar.vikingz.me/getting-started/";

/** Pick the avatar URL for a newly-created user.
 *
 * OAuth providers supply an image from the profile; email sign-ups fall back
 * to the deterministic default avatar service. */
export function resolveInitialAvatar(
  oauthProfile: OAuthProfileDto | null,
): string {
  return oauthProfile?.image ?? DEFAULT_AVATAR_URL;
}
