# 0011 — Scoped WeChat identities and placeholder email

## Status

Accepted.

## Context

Better Auth requires every user row to have a unique email, while WeChat Mini
Program login returns OpenID and optionally UnionID, not a contact email. The
previous adapter stored `<wechat-id>@wechat.invalid` and marked it verified.
That exposed an external identifier, made email recovery appear available, and
could silently switch users when an OpenID and UnionID had already created
different accounts.

OpenID is scoped to an AppID. UnionID is scoped to one WeChat Open Platform
account. Neither is an email address, and neither may be compared without its
issuer.

## Decision

- Keep Better Auth's non-null email column, but use an opaque `.invalid`
  compatibility address with `emailIsPlaceholder=true` and
  `emailVerified=false`.
- Never display, send mail to, authorize an invite with, or implicitly link an
  account through a placeholder email.
- Store WeChat identities as `(provider, subject_type, issuer, subject)`.
- Treat an OpenID and UnionID returned by one trusted WeChat response as
  evidence that both belong to the same user.
- If observed identities already belong to different users, record an
  `identity_conflicts` row and reject login rather than selecting or merging a
  user silently.
- Bind the first real email through a fresh-session, new-address-only OTP.
  Subsequent changes retain current-address plus new-address verification.
- Keep user merging outside public HTTP APIs. The maintenance command performs
  a dry-run assessment, refuses unresolved credential/data conflicts, revokes
  all sessions, and records the resolution.

## Consequences

Cross-surface continuity depends on binding the Website Application and Mini
Program to the same Open Platform account so UnionID is available. Historical
Better Auth account IDs cannot safely be classified as OpenID or UnionID; they
are imported as `legacy_unknown` and upgraded only after a trusted login.

The schema gains external identity and conflict records, and deployment must run
the idempotent WeChat backfill after applying the migration. Email delivery has
defense in depth at both auth callbacks and the final sender adapter.
