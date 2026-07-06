import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";
import type { Pool } from "pg";
import { resolveInitialAvatar } from "../../application/user/user-initializer";
import { mapGoogleProfileToDto } from "./oauth-profile-mapper";
import type { AppConfig } from "../config";

/** Build Better Auth over the shared pg pool. Email + password plus optional
 * Google OAuth.
 *
 * `defaultCurrency` is a user preference surfaced on every session; the planner
 * uses it as the default currency when composing a stop cost.
 *
 * OAuth sign-ups keep the provider's profile picture. Email sign-ups store no
 * image and render a deterministic planet-style avatar on the client, seeded by
 * the user id. The shared {@link OAuthProfileDto} keeps the mapping
 * provider-agnostic. */
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
                              image: resolveInitialAvatar(dto) ?? undefined,
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
        plugins: config.captcha
            ? [
                  captcha({
                      provider: config.captcha.provider,
                      secretKey: config.captcha.secretKey,
                  }),
              ]
            : [],
    });
}

export type Auth = ReturnType<typeof createAuth>;
