# Authentication (Better Auth)

Reference: [../reference/backend-sources.md](../reference/backend-sources.md).

## Configuration

`apps/api/src/infrastructure/auth/auth.ts` builds Better Auth with the shared
`pg.Pool`:

```ts
export const auth = betterAuth({
  database: pool,               // pg.Pool
  appName: "OpenTrip",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      // Link email via EMAIL_PROVIDER (console | resend)
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  socialProviders: config.googleOAuth || config.wechatOAuth
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
        wechat: {
          clientId: config.wechatOAuth.clientId,
          clientSecret: config.wechatOAuth.clientSecret,
        },
      }
    : undefined,
  trustedOrigins: config.trustedOrigins,
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        // Confirmation link to the *current* email
      },
    },
    additionalFields: {
      // User preference: default currency for new stop costs.
      defaultCurrency: { type: "string", required: false, defaultValue: "JPY", input: true },
    },
  },
  plugins: [
    bearer(),
    oneTimeToken({ /* mobile OAuth bridge */ }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      storeOTP: "hashed",
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      sendVerificationOTP: async ({ email, otp, type }) => {
        // Dispatched via EMAIL_PROVIDER (console | resend)
      },
    }),
    twoFactor({ issuer: "OpenTrip", allowPasswordless: true }),
    wechatMiniProgram({ identityPort: new WechatCode2SessionClient(/* … */) }),
    // optional captcha…
  ],
  // baseURL/secret come from env (BASE_URL / BETTER_AUTH_SECRET)
});
```

### Email OTP registration

Email/password sign-up creates the user with `emailVerified=false` and does
**not** issue a session until the user verifies with a 6-digit OTP. The
`emailOTP` plugin overrides Better Auth's default verification link so
`emailVerification.sendOnSignUp` / `sendOnSignIn` send an OTP instead.

Flow:

1. `POST /api/auth/sign-up/email` — create account (captcha when enabled).
2. OTP emailed via the configured provider.
3. `POST /api/auth/email-otp/verify-email` — mark verified and auto sign-in
   (`autoSignInAfterVerification`).
4. Unverified password sign-in returns `EMAIL_NOT_VERIFIED` and triggers a
   fresh OTP (`sendOnSignIn`); the SPA shows the same OTP step.

Resend uses `POST /api/auth/email-otp/send-verification-otp` (also captcha-
protected when captcha is enabled).

### Change email

Settings → Profile → Account & security uses the emailOTP change-email flow
(preferred over the link-based `/change-email` path because the app already
verifies with OTP):

1. `POST /api/auth/email-otp/send-verification-otp` with
   `type: "email-verification"` — OTP to the **current** email
   (`emailOTP.changeEmail.verifyCurrentEmail`).
2. `POST /api/auth/email-otp/request-email-change` — `{ newEmail, otp }`
   verifies the current inbox and emails an OTP to the **new** address
   (`type: "change-email"`).
3. `POST /api/auth/email-otp/change-email` — `{ newEmail, otp }` applies the
   change and marks the new email verified.

`user.changeEmail.enabled` plus `sendChangeEmailConfirmation` remain configured
for the built-in link confirmation path; the SPA uses the OTP endpoints above.

### Password change and setup

Logged-in users with a credential account call
`POST /api/auth/change-password` (`currentPassword`, `newPassword`,
`revokeOtherSessions`).

Google-only accounts (no credential row) set a first password via email OTP:

1. `POST /api/auth/email-otp/request-password-reset` — OTP
   (`type: "forget-password"`).
2. `POST /api/auth/email-otp/reset-password` — `{ email, otp, password }`
   creates or updates the credential account.

The sign-in form exposes **Forgot password?** and uses the same OTP reset
flow (request → OTP + new password → back to sign-in). Settings → Profile
reuses these endpoints for Google-only first-password setup.

`emailAndPassword.sendResetPassword` also sends a **link** email for the
standard `/request-password-reset` endpoint (captcha-protected). The SPA
prefers the OTP path above; the link handler remains available if a
token-based page is added later.

### Two-factor authentication (TOTP)

The `twoFactor` plugin stores secrets in the `twoFactor` table and
`user.twoFactorEnabled`. Issuer is `OpenTrip`. `allowPasswordless: true` lets
accounts without a password enroll (credential accounts still must confirm
their password).

Enrollment (Settings → Profile):

1. `POST /api/auth/two-factor/enable` — returns `totpURI` + `backupCodes`.
2. User scans the QR / enters the secret, then
   `POST /api/auth/two-factor/verify-totp` — sets `twoFactorEnabled`.
3. Backup codes are shown once; regenerate with
   `POST /api/auth/two-factor/generate-backup-codes`.

Disable: `POST /api/auth/two-factor/disable`.

Sign-in: after a successful password sign-in, `twoFactorClient` invokes
`onTwoFactorRedirect`. `AuthForm` shows a TOTP (or backup code) step and calls
`verifyTotp` / `verifyBackupCode` before the session is usable.

### Email provider

Outbound mail is selected by env (see `infrastructure/email/`):

| `EMAIL_PROVIDER` | Behavior |
| --- | --- |
| `console` (default) | Logs the message (including OTP / links) to API stdout — local/dev |
| `resend` | Sends via [Resend](https://resend.com) HTTP API |

- `EMAIL_FROM` — From header (required for `resend`; defaults to
  `OpenTrip <noreply@localhost>` for console).
- `RESEND_API_KEY` — required when `EMAIL_PROVIDER=resend`.

OTP copy is built by `buildOtpEmail` (`sign-in`, `email-verification`,
`forget-password`, `change-email`). Link copy is built by `buildLinkEmail`
(`reset-password`, `change-email-confirmation`).

Both builders emit **HTML + plain-text** via a shared card layout
(`email-layout.ts`) that mirrors SPA tokens from `apps/web/.../colors.css`
(silver canvas, white card, navy primary, cornflower accent bar). Composition
follows React Email’s Container / Section / Button patterns but stays as
inline-styled tables so Cloudflare Workers need no React Email runtime.
Visual cues draw from Mobbin OTP references (Heidi / Vercel / Visitors): large
tabular code, generous padding, one primary CTA.

**i18n:** copy lives in `email-copy.ts` for `en` | `zh` (same set as the SPA).
Locale resolution (`email-locale.ts`):

1. `x-opentrip-lang` from the auth client (current i18next language)
2. else `Accept-Language`
3. else `en`

The web `authClient` attaches `x-opentrip-lang` on every Better Auth request
via `fetchOptions.onRequest`.

**Production diagnostics (Workers Observability):**

- Success: `[email:resend] accepted id=… to=***@domain …` (use `id` in the
  Resend dashboard).
- Failure: `[email:resend] send failed status=… body=…`. Better Auth's
  `runInBackgroundOrAwait` still catches the throw, so sign-up / OTP routes
  often return **200 even when Resend fails** — always check these log lines,
  not only HTTP status.
- `POST /api/auth/email-otp/send-verification-otp` → `400` with
  `MISSING_RESPONSE` / `VERIFICATION_FAILED` is **Turnstile**, not Resend.
  The OTP step shows a fresh captcha; resend stays disabled until it completes.
- Domain DNS for `opentrip.im` must include Resend's DKIM
  (`resend._domainkey` TXT) plus SPF on `send` (TXT + MX). Optional: `_dmarc`.

### Social providers

Google OAuth is enabled when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are set. The redirect URI registered in Google Cloud Console must be
`{BASE_URL}/api/auth/callback/google` (API origin — Google posts the code here).

After Better Auth finishes the callback, it redirects the browser to the
**SPA** `callbackURL` from `signIn.social`. The web client must pass the
current SPA location (`origin + pathname + search`, see `AuthForm`) so invite
pages (`/invite/:token`) resume after Google sign-in. If omitted, Better Auth
defaults to API `baseURL` and the user lands on `api.*` instead of the frontend.

WeChat web QR login is enabled when `WECHAT_WEB_APP_ID` and
`WECHAT_WEB_APP_SECRET` are both set. These must belong to a WeChat Open
Platform **Website Application**. Configure its authorization callback domain
for `{BASE_URL}/api/auth/callback/wechat`. The web form places this action below
Google and uses Better Auth's built-in `wechat` social provider.

Mini Programs use a separate protocol and credential pair:
`WECHAT_MINI_PROGRAM_APP_ID` + `WECHAT_MINI_PROGRAM_APP_SECRET`.
`POST /api/auth/wechat-mini-program/sign-in` accepts the short-lived code from
`Taro.login()`. The infrastructure adapter exchanges it with WeChat's
`jscode2session` endpoint, discards `session_key`, and creates the normal Better
Auth session. The Mini Program AppSecret is never shipped to Taro.

The Mini Program collects the user-confirmed nickname and avatar with WeChat's
native `input type="nickname"` and `button open-type="chooseAvatar"` controls
before requesting that session. After identity exchange, it calls Better
Auth's native `POST /api/auth/update-user` for the nickname and
`POST /api/users/avatar` for the temporary avatar file. The bearer token is
persisted only after both profile writes succeed, so a failed upload cannot
bypass profile completion on the next launch.

Bind the Website Application and Mini Program to the same WeChat Open Platform
account when cross-surface account continuity is required. The adapter prefers
`unionid` as the Better Auth `wechat` account id (falling back to Mini Program
`openid`), matching the built-in web provider's identity selection.

Google profiles are normalized through the shared `OAuthProfileDto`
(`apps/api/src/application/user/oauth-profile.ts`) so future OAuth providers
use the same mapping path. The provider's avatar URL is written to `user.image`
during sign-up. Email sign-ups (and OAuth profiles without a picture) get a
deterministic vercel-style gradient avatar (github.com/vercel/avatar) baked into
a small static SVG data URI and stored on `user.image` (a `create.before`
database hook seeds it from the user id). The avatar is therefore static in the
database and rendered as a plain image everywhere. The generator lives in
`apps/api/src/application/user/avatar.ts` and mirrors the frontend copy in
`apps/web/src/shared/lib/avatar.ts`; the AI agent uses the same generator with
an extra dither layer (`agentAvatarUrl`).

### User preferences

`user.additionalFields.defaultCurrency` is stored on the `user` table
(`0005_currency.sql`) and surfaced on every session as `session.user.defaultCurrency`.
Users change it from Settings → Preferences (`CurrencySelect` via
`authClient.updateUser`). The planner uses it as the preselected currency when
composing a stop cost.

### Sample trip on sign-up

After Better Auth creates a user row, `databaseHooks.user.create.after` clones
the sample Japan trip (`japan-2025`) into a personal copy owned by that user
(`provisionSampleTripForUser`). The template is loaded from the live DB row when
present, otherwise from the in-memory seed snapshot. Cosmetic demo members stay
on the clone; the seed owner slot is replaced by the real user. Provisioning
errors are logged and never block registration. The shared legacy demo trip
remains listed for all signed-in users.

## Captcha

Bot protection is provided by the Better Auth Captcha plugin. It is enabled
whenever `CAPTCHA_PROVIDER` is set; the local `.env.example` ships with
Cloudflare Turnstile test keys.

```ts
// apps/api/src/infrastructure/auth/auth.ts
plugins: [
  bearer(),
  oneTimeToken({
    expiresIn: 3,
    disableClientRequest: true,
    storeToken: "hashed",
  }),
  emailOTP({ /* … */, changeEmail: { enabled: true, verifyCurrentEmail: true } }),
  twoFactor({ issuer: "OpenTrip", allowPasswordless: true }),
  ...(config.captcha
    ? [
        captcha({
          provider: config.captcha.provider,
          secretKey: config.captcha.secretKey,
          endpoints: [
            "/sign-up/email",
            "/sign-in/email",
            "/request-password-reset",
            "/email-otp/send-verification-otp",
          ],
        }),
      ]
    : []),
],
```

The plugin intercepts `POST` requests to the configured endpoints and verifies
the `x-captcha-response` token server-side. No custom controller or application
code is required.

### Environment

- `CAPTCHA_PROVIDER` — `cloudflare-turnstile`. The SPA has one CAPTCHA
  implementation; other provider values fail configuration instead of shipping
  a server/client mismatch.
- `CAPTCHA_SECRET_KEY` — provider secret key (server-side only).

The public site key (`TURNSTILE_SITE_KEY`) is consumed by the Vite build and
exposed to the browser through `shared/config`; it never reaches the backend.

## Rate limiting

Better Auth's endpoint rules remain the source of truth for request windows and
limits. In particular, email OTP send and verification endpoints use the
emailOTP plugin's limit (three requests per 60 seconds).

On Cloudflare Workers, `rateLimit.customStorage` is backed by the dedicated
`AUTH_RATE_LIMIT` Durable Object namespace. Better Auth's IP-and-path key is
SHA-256 hashed before it becomes an object name. One globally unique object
atomically consumes each key in a fixed window and deletes expired state via a
Durable Object alarm. Workers trust only Cloudflare's edge-derived
`cf-connecting-ip` header for the client partition. A missing binding fails the
Worker request with `503`; Workers never fall back to isolate memory.

Node and Docker use Better Auth's built-in in-memory limiter because they are a
single local process and have no Cloudflare runtime binding.

## Environment

- `BETTER_AUTH_SECRET` — >= 32 chars. Generate: `openssl rand -base64 32`.
- `BASE_URL` — public base URL of the API/auth server (where `/api/auth` is mounted).
- `TRUSTED_ORIGINS` — comma-separated web origins allowed to call auth (CSRF).
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (optional; enables Google sign-in).
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (optional).
- `EMAIL_PROVIDER` — `console` (default) or `resend`.
- `EMAIL_FROM` — From address for OTP mail (required for `resend`).
- `RESEND_API_KEY` — Resend API key (required for `resend`).

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

Email OTP reuses the existing `verification` table; no extra migration is
required for the plugin itself.

The `twoFactor` plugin adds `user.twoFactorEnabled` and the `twoFactor` table
(secret, backup codes, lockout fields). Prisma migration:
`apps/api/prisma/migrations/*_two_factor`. Keep
`apps/api/prisma/mysql/schema.sql` in sync for MySQL deployments.

## Client

The frontend uses `better-auth/react` (`apps/web/src/shared/auth`) pointing at
`/api/auth`, with `emailOTPClient`, `twoFactorClient`, and
`inferAdditionalFields` so `session.user.defaultCurrency` and
`session.user.twoFactorEnabled` are typed. It exposes `signIn`, `signUp`,
`signOut`, `useSession`, `authClient.emailOtp.*`, and `authClient.twoFactor.*`.

`AuthForm` is a multi-step email flow: credentials → email OTP (`OTPField`) or
2FA challenge (TOTP / backup code), plus forgot-password (email → OTP + new
password via `emailOtp.requestPasswordReset` / `resetPassword`). Google OAuth
is unchanged.

Settings → Profile (`ProfileForm` + `AccountSecuritySection`) covers display
name / avatar plus email change, password change or first-time setup, and 2FA
enrollment / management.

Avatar changes use the authenticated `/api/users/avatar` endpoints. The
application service stores or removes the object and updates Better Auth through
the server `auth.api.updateUser` API, with compensating profile rollback and
object cleanup on failure. `databaseHooks.user.update.before` trims and validates
display names (1–64 characters). The corresponding `after` hook synchronizes
name/image changes to user-backed trip member projections and publishes
`members` realtime invalidations.

### Native iOS sessions

Native clients use the Better Auth Bearer and one-time-token plugins. Email
sign-in and sign-up use the standard Better Auth endpoints and persist the
returned session token. Subsequent requests send
`Authorization: Bearer <session-token>`; browser cookie sessions are unchanged.

Email sign-up on native must also complete
`POST /api/auth/email-otp/verify-email` before a session exists.

Google OAuth uses the following bridge so a long-lived session token never
appears in a callback URL. The native client must open the start URL inside
`ASWebAuthenticationSession` (not via a separate HTTP client) so Better Auth's
OAuth state cookie lands in the same jar as Google's callback:

1. The app opens `GET /api/mobile-auth/oauth/start?provider=google` in
   `ASWebAuthenticationSession`. The endpoint calls Better Auth
   `signInSocial` with `returnHeaders: true`, then **302**s to Google while
   forwarding the OAuth state `Set-Cookie` headers.
2. Better Auth completes Google OAuth and redirects the cookie-authenticated
   browser session to `/api/mobile-auth/oauth/complete`.
3. The completion endpoint creates a hashed, three-minute, single-use token and
   redirects to `opentrip://auth/callback?code=...`.
4. `POST /api/mobile-auth/oauth/exchange` consumes the code and returns the
   Better Auth session plus its token.

If Google OAuth is not configured, start redirects to
`opentrip://auth/callback?error=oauth_unavailable` so the app receives an
error through the same callback scheme.

`opentrip://` is included in the default trusted origins. Deployments that set
`TRUSTED_ORIGINS` explicitly must include it themselves.
