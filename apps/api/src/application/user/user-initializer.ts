import type { OAuthProfileDto } from "./oauth-profile";

/** Pick the avatar URL for a newly-created user.
 *
 * OAuth providers supply an image from the profile; email sign-ups have no
 * image and get a deterministic planet-style avatar generated on the client
 * from their user id (see the shared `Avatar` component). Returning `null`
 * here keeps generated avatars out of the database. */
export function resolveInitialAvatar(
  oauthProfile: OAuthProfileDto | null,
): string | null {
  return oauthProfile?.image ?? null;
}
