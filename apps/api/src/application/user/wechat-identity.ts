export type WechatSubjectType = "openid" | "unionid";

export interface WechatExternalIdentity {
  provider: "wechat";
  subjectType: WechatSubjectType;
  issuer: string;
  subject: string;
}

export interface ExternalIdentityOwner {
  identity: WechatExternalIdentity;
  userId: string;
}

export interface ExternalIdentityRepository {
  findOwners(
    identities: readonly WechatExternalIdentity[],
  ): Promise<ExternalIdentityOwner[]>;
  bind(
    userId: string,
    identities: readonly WechatExternalIdentity[],
  ): Promise<
    | { kind: "bound" }
    | { kind: "conflict"; conflictingUserId: string; identity: WechatExternalIdentity }
  >;
  recordConflict(input: {
    primaryUserId: string;
    conflictingUserId: string;
    identity: WechatExternalIdentity;
  }): Promise<void>;
}

export type WechatIdentityResolution =
  | { kind: "unclaimed" }
  | { kind: "resolved"; userId: string }
  | {
      kind: "conflict";
      primaryUserId: string;
      conflictingUserId: string;
      identity: WechatExternalIdentity;
    };

/**
 * Resolve all identities observed in one trusted WeChat response. Different
 * owners are an explicit conflict; callers must never silently choose one.
 */
export class ResolveWechatIdentity {
  constructor(private readonly repository: ExternalIdentityRepository) {}

  async resolve(
    identities: readonly WechatExternalIdentity[],
  ): Promise<WechatIdentityResolution> {
    const owners = await this.repository.findOwners(identities);
    const userIds = [...new Set(owners.map((owner) => owner.userId))];
    if (userIds.length === 0) return { kind: "unclaimed" };
    if (userIds.length === 1) return { kind: "resolved", userId: userIds[0]! };

    const primaryUserId = owners[0]!.userId;
    const conflicting = owners.find((owner) => owner.userId !== primaryUserId)!;
    await this.repository.recordConflict({
      primaryUserId,
      conflictingUserId: conflicting.userId,
      identity: conflicting.identity,
    });
    return {
      kind: "conflict",
      primaryUserId,
      conflictingUserId: conflicting.userId,
      identity: conflicting.identity,
    };
  }

  async bind(
    userId: string,
    identities: readonly WechatExternalIdentity[],
  ): Promise<WechatIdentityResolution> {
    const result = await this.repository.bind(userId, identities);
    if (result.kind === "bound") return { kind: "resolved", userId };

    await this.repository.recordConflict({
      primaryUserId: userId,
      conflictingUserId: result.conflictingUserId,
      identity: result.identity,
    });
    return {
      kind: "conflict",
      primaryUserId: userId,
      conflictingUserId: result.conflictingUserId,
      identity: result.identity,
    };
  }
}
