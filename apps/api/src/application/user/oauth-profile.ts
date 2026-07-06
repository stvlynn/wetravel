/** Normalized OAuth profile data used when initializing a new user.
 *
 * This DTO is provider-agnostic so future OAuth strategies (Google today,
 * others tomorrow) can all feed into the same avatar initialization path. */
export interface OAuthProfileDto {
  provider: string;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
}
