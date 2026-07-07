/** Who may redeem an invite link. */
export type InviteAccessScope = "anyone" | "restricted_emails";

/** Role granted to a member who accepts the invite. */
export type InviteMemberRole = "editor" | "viewer";

/** Lifecycle state of an invite. */
export type InviteStatus = "active" | "revoked";

export interface TripInviteSnapshot {
  id: string;
  tripId: string;
  /** SHA-256 hash of the opaque token. The plaintext is never persisted. */
  tokenHash: string;
  /** Better Auth user id of the member who created the invite. */
  createdBy: string;
  accessScope: InviteAccessScope;
  /** Lowercased emails allowed to redeem when `accessScope` is restricted. */
  allowedEmails: string[];
  role: InviteMemberRole;
  /** Whether accepted members may create further invites. */
  canInvite: boolean;
  status: InviteStatus;
  /** ISO 8601 expiry, or null when the invite never expires. */
  expiresAt: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}
