import type { TripInviteSnapshot } from "./types";

export type InviteRejectionReason = "expired" | "revoked" | "email_not_allowed";

export type InviteUsability =
  | { ok: true }
  | { ok: false; reason: InviteRejectionReason };

/** Pure check of whether an invite may be redeemed by a given user. Email is
 * required only for restricted-email invites; pass the redeeming user's email. */
export function checkInviteUsable(
  invite: TripInviteSnapshot,
  opts: { email: string | null; now: Date },
): InviteUsability {
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (
    invite.expiresAt &&
    new Date(invite.expiresAt).getTime() <= opts.now.getTime()
  ) {
    return { ok: false, reason: "expired" };
  }
  if (invite.accessScope === "restricted_emails") {
    const email = opts.email?.trim().toLowerCase() ?? "";
    const allowed = invite.allowedEmails.map((e) => e.trim().toLowerCase());
    if (!email || !allowed.includes(email)) {
      return { ok: false, reason: "email_not_allowed" };
    }
  }
  return { ok: true };
}
