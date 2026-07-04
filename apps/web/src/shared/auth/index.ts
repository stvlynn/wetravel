import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { config } from "@/shared/config";

/** Better Auth React client. `baseURL` is the API origin; default `basePath`
 * `/api/auth` matches the Hono mount. In dev, Vite proxies `/api` to :8787.
 *
 * `inferAdditionalFields` mirrors the server's `user.additionalFields` so
 * `session.user.defaultCurrency` is typed on the client. The API lives in a
 * separate package, so the field shape is declared explicitly rather than
 * inferred from the server `auth` instance. */
export const authClient = createAuthClient({
  baseURL: config.baseUrl,
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields({
      user: {
        defaultCurrency: { type: "string", required: false, input: true },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
