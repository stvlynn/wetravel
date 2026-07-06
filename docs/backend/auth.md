# Authentication (Better Auth)

Reference: [../reference/backend-sources.md](../reference/backend-sources.md).

## Configuration

`apps/api/src/infrastructure/auth/auth.ts` builds Better Auth with the shared
`pg.Pool`:

```ts
export const auth = betterAuth({
  database: pool,               // pg.Pool
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
  trustedOrigins: config.trustedOrigins,
  user: {
    additionalFields: {
      // User preference: default currency for new stop costs.
      defaultCurrency: { type: "string", required: false, defaultValue: "JPY", input: true },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          if (!data.image) data.image = DEFAULT_AVATAR_URL;
        },
      },
    },
  },
  // baseURL/secret come from env (BASE_URL / BETTER_AUTH_SECRET)
});
```

### Social providers

Google OAuth is enabled when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are set. The redirect URI registered in Google Cloud Console must be
`{BASE_URL}/api/auth/callback/google`.

Google profiles are normalized through the shared `OAuthProfileDto`
(`apps/api/src/application/user/oauth-profile.ts`) so future OAuth providers
use the same mapping path. The provider's avatar URL is written to `user.image`
during sign-up; email sign-ups fall back to `DEFAULT_AVATAR_URL`.

### User preferences

`user.additionalFields.defaultCurrency` is stored on the `user` table
(`0005_currency.sql`) and surfaced on every session as `session.user.defaultCurrency`.
The planner uses it as the preselected currency when composing a stop cost.

## Environment

- `BETTER_AUTH_SECRET` — >= 32 chars. Generate: `openssl rand -base64 32`.
- `BASE_URL` — public base URL of the API/auth server (where `/api/auth` is mounted).
- `TRUSTED_ORIGINS` — comma-separated web origins allowed to call auth (CSRF).
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (optional; enables Google sign-in).
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (optional).

Never commit these. Docker uses an env file; Cloudflare uses
`wrangler secret put` / vars.

## Mounting

Hono mounts the handler before JSON body parsing:

```ts
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

Business routes read the session via shared middleware
(`auth.api.getSession({ headers })`) and reject unauthenticated requests with
`401`.

## Runtime differences

- **Node/Docker**: `auth.handler(c.req.raw)` works directly; the same is true on
  Workers since Hono passes a standard `Request`.
- The only runtime difference is the database connection source (see
  [database.md](database.md)); the auth config is identical.

## Schema

Auth tables (`user`, `session`, `account`, `verification`) are created by
`migrations/0001_auth.sql`. Re-run the Better Auth CLI to regenerate the schema
after changing options/plugins, then add a new migration. The `defaultCurrency`
additional field lives in `0005_currency.sql`.

`migrations/0007_google_oauth.sql` adds the unique constraint Better Auth needs
for OAuth account linking: `UNIQUE ("accountId", "providerId")` on the
`account` table.

## Client

The frontend uses `better-auth/react` (`apps/web/src/shared/auth`) pointing at
`/api/auth`, exposing `signIn`, `signUp`, `signOut`, and `useSession`. It loads
the `inferAdditionalFields` client plugin so `session.user.defaultCurrency` is
typed; the field shape is declared explicitly since the API is a separate
package.

Avatar changes use the authenticated `/api/users/avatar` endpoints. The
application service stores or removes the object and updates Better Auth through
the server `auth.api.updateUser` API, with compensating cleanup on failure.
