import { describe, expect, it, vi } from "vitest";
import {
  MergeUsers,
  UserMergeBlockedError,
  type UserMergePort,
} from "../src/application/user/merge-users";

describe("MergeUsers", () => {
  it("requires all conflicts to be resolved before mutating users", async () => {
    const merge = vi.fn(async () => undefined);
    const port: UserMergePort = {
      assess: vi.fn(async () => ({
        canonicalUserId: "canonical",
        duplicateUserId: "duplicate",
        blockers: ["credential_conflict"],
      })),
      merge,
    };

    await expect(
      new MergeUsers(port).execute("canonical", "duplicate"),
    ).rejects.toBeInstanceOf(UserMergeBlockedError);
    expect(merge).not.toHaveBeenCalled();
  });

  it("executes an explicitly selected, conflict-free merge", async () => {
    const merge = vi.fn(async () => undefined);
    const port: UserMergePort = {
      assess: vi.fn(async () => ({
        canonicalUserId: "canonical",
        duplicateUserId: "duplicate",
        blockers: [],
      })),
      merge,
    };

    await new MergeUsers(port).execute("canonical", "duplicate");
    expect(merge).toHaveBeenCalledWith("canonical", "duplicate");
  });
});
