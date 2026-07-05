# Avatar storage and settings remediation

## Scope

Repair the uncommitted avatar and settings implementation so both supported
deployment targets remain functional, uploads are durable and bounded, profile
updates clean up stored files, and the settings UI follows the project's UI,
accessibility, internationalization, and Feature-Sliced Design conventions.

## Backend design

### Storage configuration

Storage selection is explicit through `STORAGE_BACKEND=fs|s3`. Missing or
unknown values fail during startup. Both adapters implement one application
port using runtime-neutral byte arrays rather than Node `Buffer` types.

The filesystem adapter is available to Node/Docker and uses `STORAGE_ROOT`.
Docker mounts that path from a named volume. The S3 adapter uses AWS SDK for
JavaScript v3 and is configured entirely through `S3_ENDPOINT`, `S3_BUCKET`,
`S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and the optional
`S3_FORCE_PATH_STYLE`. This supports AWS S3, Cloudflare R2's S3-compatible API,
and compatible local services without native modules. `STORAGE_PUBLIC_URL`
controls generated URLs and otherwise resolves to the API upload route.

Node and Worker entry points select only compatible adapters so the Worker
bundle never imports filesystem or native Node storage implementations.
OpenDAL is removed.

### Profile and avatar flow

The authenticated avatar endpoint owns the complete operation:

1. Reject oversized requests with Hono `bodyLimit` before multipart parsing.
2. Validate the actual file length, supported MIME type, and image signature.
3. Store the new object under the authenticated user's namespace.
4. Update the current Better Auth user through the server API.
5. Delete the previous managed avatar after the user update succeeds.

If the Better Auth update fails, the new object is deleted before the error is
returned. Removing an avatar updates Better Auth first and then deletes the
previous managed object. External image URLs are never deleted. Storage
failures are logged or propagated rather than converted indiscriminately to
404 responses.

The HTTP controller remains thin: it parses validated input, creates a
request-bound Better Auth profile adapter, calls the application service, and
formats the standard response envelope.

## Frontend design

- Profile avatar upload and removal call the server-owned endpoints and map
  stable error codes to localized copy. The client no longer performs a second
  Better Auth image update.
- `lucide-react` supplies profile, settings, information, close, logout, and
  chevron icons. No duplicated inline SVG paths remain in the changed settings
  surfaces.
- The dialog follows Base UI's Root/Portal/Backdrop/Viewport/Popup structure,
  uses `DialogTitle` and `DialogDescription`, preserves outside-click dismissal,
  and adapts navigation/content layout for narrow screens.
- Theme initialization runs before React renders. System mode subscribes to
  `prefers-color-scheme` changes and cleans up the listener.
- The displayed application version is injected from package metadata at build
  time. Avatar fallback colors reference semantic CSS tokens rather than raw
  hexadecimal colors in TypeScript.

## Error handling and security

The maximum avatar file size remains 2 MiB. The transport request allowance is
slightly larger only to account for multipart framing. Validation uses actual
content length and file signatures, not only the browser-provided MIME type.
Public object paths remain constrained to managed avatar keys. Missing objects
return 404; storage outages reach the central error handler and remain
observable.

## Testing

- Unit-test avatar validation, successful replacement/removal, failed profile
  updates, compensation cleanup, and unmanaged external URLs.
- Unit-test storage configuration for filesystem, S3, missing values, invalid
  backends, and boolean parsing.
- Test theme resolution and system-change subscription where practical.
- Run typecheck, lint, all tests, production builds, documentation checks, and
  a Worker entry bundle check.

## Documentation and deployment

Update API, backend, frontend, Docker, and Cloudflare documentation. Docker
receives a persistent uploads volume and explicit filesystem env values.
Cloudflare examples document S3-compatible R2 credentials as secrets and the
non-secret endpoint, bucket, and region variables. No secret values are
committed.

