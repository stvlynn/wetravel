# Pages (frontend)

The SPA is a static build (`apps/web/dist`) deployed to Cloudflare Pages.

## Build

The API/auth origin is baked in at build time via `BASE_URL`:

```bash
BASE_URL="https://wetravel-api.<subdomain>.workers.dev" \
  pnpm --filter @wetravel/web build
```

## Deploy

```bash
wrangler pages deploy apps/web/dist --project-name wetravel-web
```

## SPA routing

The app uses history-based client routing. Add a `_redirects` file (already in
`apps/web/public`) so deep links resolve to `index.html`:

```
/*  /index.html  200
```

## CORS / auth

- Set the Worker var `TRUSTED_ORIGINS` to the Pages origin
  (e.g. `https://wetravel-web.pages.dev`).
- Set `BASE_URL` to the Worker origin for both frontend calls and Better Auth.
- The SPA sends credentials; the API's CORS is configured from
  `TRUSTED_ORIGINS`.
