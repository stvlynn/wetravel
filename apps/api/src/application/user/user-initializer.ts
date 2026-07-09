import type { OAuthProfileDto } from "./oauth-profile";
import { gradientAvatarUrl } from "./avatar";

/** Pick the avatar URL for a newly-created user.
 *
 * OAuth providers supply an image from the profile; users without one get a
 * deterministic vercel-style gradient avatar (github.com/vercel/avatar),
 * generated from a stable `seed` and stored statically in the database so the
 * UI always renders a fixed image. */
export function resolveInitialAvatar(
  oauthProfile: OAuthProfileDto | null,
  seed: string,
): string {
  return oauthProfile?.image ?? gradientAvatarUrl(seed);
}

/** Generate the static gradient avatar for a user identified by `seed`. */
export function generateUserAvatar(seed: string): string {
  return gradientAvatarUrl(seed);
}
