# Authentication and session


Auth is **Better Auth** mounted at `/api/auth/*`. See [auth.md](../auth.md) for
server config, captcha, Google OAuth, and `defaultCurrency`.

### Session model for non-browser clients

1. Session middleware runs on every request:
   `auth.api.getSession({ headers })`.
2. Business routes under `/api` (except health, invite preview, uploads) require
   a session; otherwise `401`.
3. The web app sends **cookies** with `credentials: "include"`
   (`apps/web/src/shared/api/client.ts`).
4. **Mobile / native apps** should:
   - Point the Better Auth client (or equivalent HTTP) at the same API origin
     and base path `/api/auth`.
   - Persist and re-send the session **cookie** (cookie jar / `Cookie` header)
     on every API call after sign-in. CORS `credentials: true` and
     `TRUSTED_ORIGINS` apply to browser clients; native apps talking to the API
     origin directly rely on cookie storage, not browser CORS.
   - Prefer the official Better Auth client for the platform when available so
     sign-in, sign-up, session refresh, and sign-out stay compatible.

### Client-relevant Better Auth surfaces

Not every Better Auth plugin path is listed here. Clients need at least:

| Action | Typical path (under `/api/auth`) | Notes |
| --- | --- | --- |
| Email sign-up | `POST …/sign-up/email` | Creates unverified user; OTP emailed. Captcha when enabled |
| Verify email OTP | `POST …/email-otp/verify-email` | Marks verified + auto sign-in |
| Resend email OTP | `POST …/email-otp/send-verification-otp` | Captcha when enabled |
| Email sign-in | `POST …/sign-in/email` | Unverified → `EMAIL_NOT_VERIFIED` + OTP resent |
| Social sign-in | `POST …/sign-in/social` | Google when configured |
| Session | `GET …/get-session` | Current user + session |
| Sign-out | `POST …/sign-out` | Clears session |
| Update user | Better Auth `updateUser` | e.g. `name`, `defaultCurrency` |

### Native OAuth bridge

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/mobile-auth/oauth/start?provider=google` | 302 to Google with Better Auth OAuth state cookies (open inside ASWebAuth) |
| GET | `/api/mobile-auth/oauth/complete` | Convert the browser cookie session to a one-time app callback code |
| POST | `/api/mobile-auth/oauth/exchange` | Consume `{ code }` and return `{ token, session }` |

The callback code is hashed at rest, valid for three minutes, and consumed on
first use. Native business requests send the returned session token as a Bearer
credential.

Cloudflare Turnstile (when `CAPTCHA_PROVIDER=cloudflare-turnstile`) intercepts
protected auth POSTs via header `x-captcha-response`. Other CAPTCHA providers
are not supported. See [auth.md](../auth.md).

Avatar image for the signed-in user is **not** only Better Auth: use
`POST/DELETE /api/users/avatar` so storage and profile stay consistent.

---

[← API index](./README.md) · [Auth deep-dive](../auth.md)
