import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import type { AppConfig } from "../config";

/** Build Better Auth over the shared pg pool. Email + password only.
 *
 * `defaultCurrency` is a user preference surfaced on every session; the planner
 * uses it as the default currency when composing a stop cost. */
export function createAuth(config: AppConfig, pool: Pool) {
  return betterAuth({
    database: pool,
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: { enabled: true },
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
  });
}

export type Auth = ReturnType<typeof createAuth>;
