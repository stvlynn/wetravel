import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";
import type { Pool } from "pg";
import { provisionSampleTripForUser } from "../../application/user/provision-sample-trip";
import {
  generateUserAvatar,
  resolveInitialAvatar,
} from "../../application/user/user-initializer";
import type { Trip, TripRepository } from "../../domain/trip";
import { mapGoogleProfileToDto } from "./oauth-profile-mapper";
import type { AppConfig } from "../config";

export interface CreateAuthOptions {
  /** When set, each new user receives a personal copy of the sample trip. */
  tripRepository?: TripRepository;
  loadSampleTripTemplate?: () => Promise<Trip>;
}

/** Build Better Auth over the shared pg pool. Email + password plus optional
 * Google OAuth.
 *
 * `defaultCurrency` is a user preference surfaced on every session; the planner
 * uses it as the default currency when composing a stop cost.
 *
 * OAuth sign-ups keep the provider's profile picture. Users without one get a
 * deterministic vercel-style gradient avatar (github.com/vercel/avatar) baked
 * into a static data URI and stored on `user.image`, so the UI always renders a
 * fixed image. The shared {@link OAuthProfileDto} keeps the mapping
 * provider-agnostic.
 *
 * After user creation, a personal clone of the sample Japan trip is provisioned
 * when trip dependencies are wired (see {@link CreateAuthOptions}). */
export function createAuth(
  config: AppConfig,
  pool: Pool,
  options: CreateAuthOptions = {},
) {
    const { tripRepository, loadSampleTripTemplate } = options;
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
                          const seed = dto.email ?? dto.name ?? crypto.randomUUID();
                          return {
                              name: dto.name ?? undefined,
                              email: dto.email ?? undefined,
                              image: resolveInitialAvatar(dto, seed),
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
                    before: async (user) => {
                        if (user.image) return;
                        const seed = user.id ?? user.email ?? crypto.randomUUID();
                        return { data: { ...user, image: generateUserAvatar(seed) } };
                    },
                    after: async (user) => {
                        if (!tripRepository || !loadSampleTripTemplate) return;
                        await provisionSampleTripForUser(
                            tripRepository,
                            {
                                id: user.id,
                                name: user.name,
                                image: user.image ?? null,
                            },
                            loadSampleTripTemplate,
                        );
                    },
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
