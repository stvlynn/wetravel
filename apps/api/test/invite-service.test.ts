import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TripInviteService, type InviteActor } from "../src/application/invite-service";
import { Trip } from "../src/domain/trip";
import type { TripRepository, TripSummary } from "../src/domain/trip";
import type {
  TripInviteRepository,
  TripInviteSnapshot,
} from "../src/domain/invite";

/** In-memory trip repository backed by a single aggregate instance. */
class FakeTripRepository implements TripRepository {
  constructor(private trip: Trip) {}
  findSummaries(): Promise<TripSummary[]> {
    return Promise.resolve([]);
  }
  findById(id: string): Promise<Trip | null> {
    return Promise.resolve(this.trip.id === id ? this.trip : null);
  }
  create(): Promise<void> {
    return Promise.resolve();
  }
  addMember(): Promise<void> {
    // The aggregate already added the member; nothing else to persist here.
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  clearAgentSeedPending(): Promise<void> {
    return Promise.resolve();
  }
  updateIntake(): Promise<void> {
    return Promise.resolve();
  }
  addDay(): Promise<void> {
    return Promise.resolve();
  }
  updateDay(): Promise<void> {
    return Promise.resolve();
  }
  reorderDays(): Promise<void> {
    return Promise.resolve();
  }
  deleteDay(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeInviteRepository implements TripInviteRepository {
  invites: TripInviteSnapshot[] = [];
  acceptances: Array<{ inviteId: string; userId: string }> = [];
  create(invite: TripInviteSnapshot): Promise<void> {
    this.invites.push(invite);
    return Promise.resolve();
  }
  findByTokenHash(tokenHash: string): Promise<TripInviteSnapshot | null> {
    return Promise.resolve(
      this.invites.find((i) => i.tokenHash === tokenHash) ?? null,
    );
  }
  revoke(inviteId: string): Promise<void> {
    const invite = this.invites.find((i) => i.id === inviteId);
    if (invite) invite.status = "revoked";
    return Promise.resolve();
  }
  recordAcceptance(inviteId: string, userId: string): Promise<void> {
    this.acceptances.push({ inviteId, userId });
    return Promise.resolve();
  }
}

function setup() {
  const trip = Trip.create({ title: "Kyoto week" }, { id: "owner", name: "Owner" });
  const trips = new FakeTripRepository(trip);
  const invites = new FakeInviteRepository();
  const service = new TripInviteService(invites, trips);
  return { trip, trips, invites, service };
}

const OWNER: InviteActor = { id: "owner", name: "Owner", email: "owner@example.com" };
const GUEST: InviteActor = { id: "guest", name: "Guest", email: "guest@example.com" };

describe("TripInviteService", () => {
  it("creates an invite and lets a new user join with the invited role", async () => {
    const { trip, service } = setup();
    const created = await service.createInvite(trip.id, OWNER, {
      accessScope: "anyone",
      allowedEmails: [],
      role: "viewer",
      canInvite: false,
      expiresAt: null,
    });
    expect(created.token).toBeTruthy();

    const result = await service.acceptInvite(created.token, GUEST);
    expect(result.joined).toBe(true);
    expect(result.trip.id).toBe(trip.id);
    expect(result.trip.permissions.isMember).toBe(true);
    expect(trip.permissionsFor("guest")).toEqual({
      isMember: true,
      canEdit: false,
      canInvite: false,
    });
  });

  it("rejects invite creation from a user without permission", async () => {
    const { trip, service } = setup();
    await expect(
      service.createInvite(trip.id, GUEST, {
        accessScope: "anyone",
        allowedEmails: [],
        role: "editor",
        canInvite: false,
        expiresAt: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects a past expiry", async () => {
    const { trip, service } = setup();
    await expect(
      service.createInvite(trip.id, OWNER, {
        accessScope: "anyone",
        allowedEmails: [],
        role: "editor",
        canInvite: false,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toThrow();
  });

  it("rejects accepting an expired invite", async () => {
    const { trip, invites, service } = setup();
    // Insert an already-expired invite directly to bypass creation guards.
    invites.invites.push({
      id: "i1",
      tripId: trip.id,
      tokenHash: hash("expired-token"),
      createdBy: "owner",
      accessScope: "anyone",
      allowedEmails: [],
      role: "editor",
      canInvite: false,
      status: "active",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    await expect(service.acceptInvite("expired-token", GUEST)).rejects.toThrow();
  });

  it("enforces restricted-email invites", async () => {
    const { trip, service } = setup();
    const created = await service.createInvite(trip.id, OWNER, {
      accessScope: "restricted_emails",
      allowedEmails: ["allowed@example.com"],
      role: "editor",
      canInvite: false,
      expiresAt: null,
    });
    await expect(service.acceptInvite(created.token, GUEST)).rejects.toThrow();
    await expect(
      service.acceptInvite(created.token, {
        id: "wechat-user",
        name: "WeChat User",
        email: null,
      }),
    ).rejects.toThrow();

    const allowed: InviteActor = {
      id: "allowed",
      name: "Allowed",
      email: "Allowed@example.com",
    };
    const result = await service.acceptInvite(created.token, allowed);
    expect(result.joined).toBe(true);
  });

  it("is idempotent for a user who is already a member", async () => {
    const { trip, service } = setup();
    const created = await service.createInvite(trip.id, OWNER, {
      accessScope: "anyone",
      allowedEmails: [],
      role: "editor",
      canInvite: false,
      expiresAt: null,
    });
    await service.acceptInvite(created.token, GUEST);
    const second = await service.acceptInvite(created.token, GUEST);
    expect(second.joined).toBe(false);
    expect(second.trip.id).toBe(trip.id);
    expect(trip.toSnapshot().members.filter((m) => m.userId === "guest")).toHaveLength(1);
  });

  it("regenerates an invite, issuing a new link and revoking the old one", async () => {
    const { trip, invites, service } = setup();
    const first = await service.createInvite(trip.id, OWNER, {
      accessScope: "anyone",
      allowedEmails: [],
      role: "editor",
      canInvite: false,
      expiresAt: null,
    });

    const second = await service.regenerateInvite(trip.id, OWNER, first.token, {
      accessScope: "anyone",
      allowedEmails: [],
      role: "editor",
      canInvite: false,
      expiresAt: null,
    });

    expect(second.token).not.toBe(first.token);
    expect(invites.invites).toHaveLength(2);
    expect(invites.invites.find((i) => i.tokenHash === hash(first.token))?.status).toBe(
      "revoked",
    );

    await expect(service.acceptInvite(first.token, GUEST)).rejects.toThrow();
    const joined = await service.acceptInvite(second.token, GUEST);
    expect(joined.joined).toBe(true);
  });

  it("previews an invite for an unauthenticated visitor", async () => {
    const { trip, service } = setup();
    const created = await service.createInvite(trip.id, OWNER, {
      accessScope: "anyone",
      allowedEmails: [],
      role: "viewer",
      canInvite: false,
      expiresAt: null,
    });
    const preview = await service.previewInvite(created.token, null);
    expect(preview).toMatchObject({
      tripId: trip.id,
      tripTitle: "Kyoto week",
      inviterName: "Owner",
      role: "viewer",
      status: "usable",
      alreadyMember: false,
    });
  });
});

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
