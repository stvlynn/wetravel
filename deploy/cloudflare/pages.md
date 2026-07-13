# Pages (frontend)

The SPA is a static build (`apps/web/dist`) deployed to Cloudflare Pages
project **`opentrip-web`**.

## Production

| Item | Value |
| --- | --- |
| Project | `opentrip-web` |
| Custom domains | `opentrip.im`, `www.opentrip.im` |
| Default hostname | `opentrip-web.pages.dev` |
| Build-time `BASE_URL` | `https://api.opentrip.im` |

## Deploy (preferred)

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>
node deploy/cloudflare/scripts/deploy-web.mjs
```

On every push to `main`, GitHub Actions runs the same script.

## Deploy (manual)

```bash
BASE_URL="https://api.opentrip.im" \
  pnpm --filter @opentrip/web build
npx wrangler pages deploy apps/web/dist \
  --project-name opentrip-web \
  --branch main
```

## SPA routing

The app uses history-based client routing. `apps/web/public/_redirects` is
copied into `dist` so deep links resolve to `index.html`:

```
/*  /index.html  200
```

## Headers

`apps/web/public/_headers` is copied into `dist` alongside `_redirects`:
`/sw.js` and `/manifest.webmanifest` are `Cache-Control: no-cache` so new
service-worker deploys are picked up promptly (the in-app update prompt
depends on it), and hashed `/assets/*` are `public, max-age=31536000,
immutable`.

## CORS / auth

- Worker var `TRUSTED_ORIGINS` includes `https://opentrip.im`,
  `https://www.opentrip.im`, and `https://opentrip-web.pages.dev`.
- Worker var / frontend build `BASE_URL` is `https://api.opentrip.im`.
- The SPA sends credentials; the API CORS list comes from `TRUSTED_ORIGINS`.
