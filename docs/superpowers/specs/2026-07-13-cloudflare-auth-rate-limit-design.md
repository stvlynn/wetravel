# Cloudflare Authentication Rate-Limit Design

## Objective

Make Better Auth rate limiting globally consistent on Cloudflare Workers and
align the deployed CAPTCHA contract with the only browser implementation,
Cloudflare Turnstile.

## Decision

Cloudflare Workers use a dedicated `AuthRateLimitObject` Durable Object as
Better Auth's `rateLimit.customStorage`. Each Better Auth rate-limit key maps to
one Durable Object instance, which atomically checks and increments a fixed
window counter. This is the only production rate-limit storage implementation.

Node and Docker keep Better Auth's built-in in-memory rate limiter because they
run as a single local process and do not have Cloudflare bindings. There is no
runtime fallback from Durable Objects to memory on Workers: a missing binding
is a deployment error.

The application supports only `cloudflare-turnstile` as its CAPTCHA provider.
Backend configuration, the Pages deployment script, examples, and docs reject
any other provider instead of advertising an unimplemented browser flow.

## Architecture

`AuthRateLimitObject` owns one counter record containing `count` and
`windowStartedAt`. Its internal consume endpoint accepts Better Auth's
`window` and `max`, resets an expired window, increments an allowed request,
and returns `{ allowed, retryAfter }`. Durable Object serialization and storage
make this operation globally atomic for the key.

The Worker creates a Better Auth custom storage adapter around the
`AUTH_RATE_LIMIT` namespace. `getByName(key)` routes every request for the same
Better Auth key to the same object. Only `consume` is used for enforcement;
`get` and `set` satisfy the Better Auth 1.6 compatibility contract without
creating an alternate decision path.

The existing `TripRealtimeObject` remains separate because realtime state and
authentication abuse controls have different ownership, data lifetimes, and
failure domains.

## Deployment

Wrangler declares an `AUTH_RATE_LIMIT` binding and a new SQLite Durable Object
migration. The Worker environment requires this binding. The existing deploy
script carries the committed Durable Object configuration unchanged while it
injects environment-specific Hyperdrive bindings and variables.

Production continues to use `CAPTCHA_PROVIDER=cloudflare-turnstile`,
`TURNSTILE_SITE_KEY`, and `CAPTCHA_SECRET_KEY`. Any other non-empty provider
fails configuration or the Pages deployment before a broken release can ship.

## Error Handling

Malformed internal Durable Object requests return `400`. Storage or binding
failures fail closed through the authentication request instead of silently
switching to process memory. Rate-limit denials are returned through Better
Auth's standard `429` response and retry metadata.

## Verification

Tests cover fixed-window counting, expiry, denial retry timing, concurrent
consumption, the Worker adapter contract, required Wrangler binding/migration,
and Turnstile-only configuration. Existing API and web checks must continue to
pass. Documentation records the production topology and operational contract.

## Non-goals

This change does not add KV, PostgreSQL, Cloudflare PoP Rate Limiting bindings,
or provider-specific CAPTCHA widgets. It does not alter Better Auth's endpoint
limits or the separate duplicate-registration recovery behavior.
