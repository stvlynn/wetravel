import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import { DEFAULT_AVATAR_URL, resolveInitialAvatar } from "../../application/user/user-initializer";
import { mapGoogleProfileToDto } from "./oauth-profile-mapper";
import type { AppConfig } from "../config";

/** Build Better Auth over the shared pg pool. Email + password plus optional
 * Google OAuth.
 *
 * `defaultCurrency` is a user preference surfaced on every session; the planner
 * uses it as the default currency when composing a stop cost.
 *
 * New users always start with an avatar: OAuth sign-ups keep the provider's
 * profile picture, while email sign-ups fall back to the default planet avatar
 * service. The shared {@link OAuthProfileDto} keeps the mapping provider-agnostic. */
export function createAuth(config: AppConfig, pool: Pool) {
    return betterAuth({
        database: pool,
        secret: config.betterAuthSecret,
        baseURL: config.betterAuthUrl,
        basePath: "/api/auth",
        trustedOrigins: config.trustedOrigins,
        emailAndPassword: { enabled: true },
        socialProviders: config.googleOAuth
            ? {
                  google: {
                      clientId: config.googleOAuth.clientId,
                      clientSecret: config.googleOAuth.clientSecret,
                      mapProfileToUser: (profile) => {
                          const dto = mapGoogleProfileToDto(profile);
                          return {
                              name: dto.name ?? undefined,
                              email: dto.email ?? undefined,
                              image: resolveInitialAvatar(dto),
                          };
                      },
                  },
              }
            : undefined,
        user: {
            additionalFields: {
                defaultCurrency: {
                    type: "string",
                    required: false,
                    defaultValue: "JPY",
                    input: true,
                },
            },
        },
        databaseHooks: {
            user: {
                create: {
                    before: async (data) => {
                        if (!data.image) {
                            data.image = DEFAULT_AVATAR_URL;
                        }
                        return { data };
                    },
                },
            },
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;
