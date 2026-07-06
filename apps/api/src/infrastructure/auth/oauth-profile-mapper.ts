import type { OAuthProfileDto } from "../../application/user/oauth-profile";

/** Map a raw Google OAuth profile into the shared OAuth DTO.
 *
 * `profile` is the object returned by Google's userinfo endpoint. */
export function mapGoogleProfileToDto(profile: unknown): OAuthProfileDto {
  const p = typeof profile === "object" && profile !== null
    ? (profile as Record<string, unknown>)
    : {};
  return {
    provider: "google",
    providerAccountId: stringOrNull(p.sub) ?? "unknown",
    email: stringOrNull(p.email),
    name: stringOrNull(p.name),
    image: stringOrNull(p.picture),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
