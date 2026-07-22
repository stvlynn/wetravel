import { describe, expect, it, vi } from "vitest";
import {
  ResolveWechatIdentity,
  type ExternalIdentityRepository,
  type WechatExternalIdentity,
} from "../src/application/user/wechat-identity";

const openid: WechatExternalIdentity = {
  provider: "wechat",
  subjectType: "openid",
  issuer: "mini-app",
  subject: "open-id",
};
const unionid: WechatExternalIdentity = {
  provider: "wechat",
  subjectType: "unionid",
  issuer: "open-platform",
  subject: "union-id",
};

function repository(
  overrides: Partial<ExternalIdentityRepository> = {},
): ExternalIdentityRepository {
  return {
    findOwners: vi.fn(async () => []),
    bind: vi.fn(async () => ({ kind: "bound" as const })),
    recordConflict: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("ResolveWechatIdentity", () => {
  it("resolves OpenID and UnionID owned by the same user", async () => {
    const repo = repository({
      findOwners: vi.fn(async () => [
        { identity: openid, userId: "user-1" },
        { identity: unionid, userId: "user-1" },
      ]),
    });

    await expect(
      new ResolveWechatIdentity(repo).resolve([openid, unionid]),
    ).resolves.toEqual({ kind: "resolved", userId: "user-1" });
  });

  it("records and rejects identities already split across users", async () => {
    const recordConflict = vi.fn(async () => undefined);
    const repo = repository({
      findOwners: vi.fn(async () => [
        { identity: openid, userId: "user-1" },
        { identity: unionid, userId: "user-2" },
      ]),
      recordConflict,
    });

    await expect(
      new ResolveWechatIdentity(repo).resolve([openid, unionid]),
    ).resolves.toMatchObject({
      kind: "conflict",
      primaryUserId: "user-1",
      conflictingUserId: "user-2",
    });
    expect(recordConflict).toHaveBeenCalledWith({
      primaryUserId: "user-1",
      conflictingUserId: "user-2",
      identity: unionid,
    });
  });

  it("fails closed when a concurrent bind reveals another owner", async () => {
    const recordConflict = vi.fn(async () => undefined);
    const repo = repository({
      bind: vi.fn(async () => ({
        kind: "conflict" as const,
        conflictingUserId: "user-2",
        identity: unionid,
      })),
      recordConflict,
    });

    await expect(
      new ResolveWechatIdentity(repo).bind("user-1", [openid, unionid]),
    ).resolves.toMatchObject({
      kind: "conflict",
      primaryUserId: "user-1",
      conflictingUserId: "user-2",
    });
    expect(recordConflict).toHaveBeenCalledOnce();
  });
});
