import type { TripInviteSnapshot } from "./types";

/** Repository port for trip invites. Implemented in infrastructure. */
export interface TripInviteRepository {
  /** Persist a brand-new invite (base row + allowed emails). */
  create(invite: TripInviteSnapshot): Promise<void>;
  /** Look an invite up by its token hash, or null when unknown. */
  findByTokenHash(tokenHash: string): Promise<TripInviteSnapshot | null>;
  /** Record that a user redeemed an invite. Idempotent per (invite, user). */
  recordAcceptance(inviteId: string, userId: string): Promise<void>;
}
