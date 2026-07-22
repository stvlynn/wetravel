import { createHash, randomBytes } from "node:crypto";
import { DomainError, NotFoundError } from "../domain/shared/errors";
import {
  checkInviteUsable,
  type InviteAccessScope,
  type InviteMemberRole,
  type TripInviteRepository,
  type TripInviteSnapshot,
} from "../domain/invite";
import type { TripRepository } from "../domain/trip";
import {
  createTripChange,
  type TripChangePublisher,
} from "../domain/realtime";
import { toTripDto, type TripDto } from "./dto";

/** The user redeeming or creating an invite. */
export interface InviteActor {
  id: string;
  name: string;
  email: string | null;
  image?: string | null;
}

export interface CreateInviteInput {
  accessScope: InviteAccessScope;
  allowedEmails: string[];
  role: InviteMemberRole;
  canInvite: boolean;
  /** ISO 8601 expiry, or null for a link that never expires. */
  expiresAt: string | null;
}

export interface CreatedInvite {
  /** Plaintext token, returned once. Only its hash is persisted. */
  token: string;
  expiresAt: string | null;
}

export type InvitePreviewStatus =
  | "usable"
  | "expired"
  | "revoked"
  | "email_restricted";

export interface InvitePreview {
  tripId: string;
  tripTitle: string;
  inviterName: string;
  memberCount: number;
  role: InviteMemberRole;
  accessScope: InviteAccessScope;
  status: InvitePreviewStatus;
  /** True when the viewing user is already a member (accept is idempotent). */
  alreadyMember: boolean;
  expiresAt: string | null;
}

export interface AcceptedInvite {
  trip: TripDto;
  /** True when this call added the user; false when they were already a member. */
  joined: boolean;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Invite lifecycle use cases. Coordinates the invite and trip aggregates. */
export class TripInviteService {
  constructor(
    private invites: TripInviteRepository,
    private trips: TripRepository,
    private changes: TripChangePublisher | null = null,
  ) {}

  private async loadTrip(tripId: string) {
    const trip = await this.trips.findById(tripId);
    if (!trip) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    return trip;
  }

  async createInvite(
    tripId: string,
    actor: InviteActor,
    input: CreateInviteInput,
  ): Promise<CreatedInvite> {
    const trip = await this.loadTrip(tripId);
    if (!trip.permissionsFor(actor.id).canInvite) {
      throw new DomainError(
        "insufficient_permissions",
        "You do not have permission to invite members to this trip",
      );
    }

    const allowedEmails =
      input.accessScope === "restricted_emails"
        ? normalizeEmails(input.allowedEmails)
        : [];
    if (input.accessScope === "restricted_emails" && allowedEmails.length === 0) {
      throw new DomainError(
        "invite_missing_emails",
        "At least one email is required for a restricted invite",
      );
    }

    const expiresAt = normalizeExpiry(input.expiresAt);

    const token = randomBytes(32).toString("base64url");
    const invite: TripInviteSnapshot = {
      id: `i${Date.now()}-${randomBytes(4).toString("hex")}`,
      tripId,
      tokenHash: hashToken(token),
      createdBy: actor.id,
      accessScope: input.accessScope,
      allowedEmails,
      role: input.role,
      canInvite: input.canInvite,
      status: "active",
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    await this.invites.create(invite);
    return { token, expiresAt };
  }

  /**
   * Issue a fresh invite link and retire the previous one. Creating the
   * replacement first (which enforces permissions and validation) means a
   * failure leaves the existing link intact; the old link is only revoked once
   * the new one exists.
   */
  async regenerateInvite(
    tripId: string,
    actor: InviteActor,
    previousToken: string,
    input: CreateInviteInput,
  ): Promise<CreatedInvite> {
    const created = await this.createInvite(tripId, actor, input);
    const previous = await this.invites.findByTokenHash(hashToken(previousToken));
    if (previous && previous.tripId === tripId) {
      await this.invites.revoke(previous.id);
    }
    return created;
  }

  async previewInvite(
    token: string,
    actor: InviteActor | null,
  ): Promise<InvitePreview> {
    const invite = await this.requireInvite(token);
    const trip = await this.loadTrip(invite.tripId);
    const snapshot = trip.toSnapshot();
    const inviter = snapshot.members.find((m) => m.userId === invite.createdBy);

    const usability = checkInviteUsable(invite, {
      email: actor?.email ?? null,
      now: new Date(),
    });
    let status: InvitePreviewStatus = "usable";
    if (!usability.ok) {
      status =
        usability.reason === "email_not_allowed"
          ? "email_restricted"
          : usability.reason;
    }

    return {
      tripId: invite.tripId,
      tripTitle: snapshot.title,
      inviterName: inviter?.name ?? snapshot.title,
      memberCount: snapshot.members.length,
      role: invite.role,
      accessScope: invite.accessScope,
      status,
      alreadyMember: actor ? !!trip.memberByUserId(actor.id) : false,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(
    token: string,
    actor: InviteActor,
  ): Promise<AcceptedInvite> {
    const invite = await this.requireInvite(token);
    const trip = await this.loadTrip(invite.tripId);

    if (trip.memberByUserId(actor.id)) {
      await this.invites.recordAcceptance(invite.id, actor.id);
      return { trip: toTripDto(trip, actor.id), joined: false };
    }

    const usability = checkInviteUsable(invite, {
      email: actor.email,
      now: new Date(),
    });
    if (!usability.ok) {
      throw new DomainError(
        `invite_${usability.reason}`,
        rejectionMessage(usability.reason),
      );
    }

    const member = trip.addMember({
      userId: actor.id,
      name: actor.name,
      image: actor.image ?? null,
      role: invite.role,
      canInvite: invite.canInvite,
    });
    await this.trips.addMember(invite.tripId, member);
    await this.invites.recordAcceptance(invite.id, actor.id);
    if (this.changes) {
      try {
        await this.changes.publish(
          createTripChange({
            eventId: crypto.randomUUID(),
            tripId: invite.tripId,
            revision: trip.toSnapshot().version,
            actorId: actor.id,
            occurredAt: new Date().toISOString(),
            scopes: ["members"],
          }),
        );
      } catch (error) {
        console.error("Failed to publish trip membership change", {
          tripId: invite.tripId,
          revision: trip.toSnapshot().version,
          error,
        });
      }
    }
    return { trip: toTripDto(trip, actor.id), joined: true };
  }

  private async requireInvite(token: string): Promise<TripInviteSnapshot> {
    const invite = await this.invites.findByTokenHash(hashToken(token));
    if (!invite) {
      throw new NotFoundError("invite_not_found", "Invite not found");
    }
    return invite;
  }
}

function normalizeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

/** Validate and normalize an ISO expiry; reject past timestamps. */
function normalizeExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError("invalid_expiry", "Expiry is not a valid date");
  }
  if (parsed.getTime() <= Date.now()) {
    throw new DomainError("invalid_expiry", "Expiry must be in the future");
  }
  return parsed.toISOString();
}

function rejectionMessage(reason: "expired" | "revoked" | "email_not_allowed"): string {
  switch (reason) {
    case "expired":
      return "This invite has expired";
    case "revoked":
      return "This invite has been revoked";
    case "email_not_allowed":
      return "This invite is restricted to specific email addresses";
  }
}
