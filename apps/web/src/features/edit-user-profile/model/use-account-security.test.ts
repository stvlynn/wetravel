import { describe, expect, it } from "vitest";
import { resolveEmailState } from "./use-account-security";

describe("resolveEmailState", () => {
  it("never exposes a placeholder email even if a legacy row was verified", () => {
    expect(
      resolveEmailState({
        email: "wechat+opaque@identity.invalid",
        emailVerified: true,
        emailIsPlaceholder: true,
      }),
    ).toEqual({ kind: "unbound", address: null, verified: false });
  });

  it("returns a verified real contact address", () => {
    expect(
      resolveEmailState({
        email: "traveler@example.com",
        emailVerified: true,
        emailIsPlaceholder: false,
      }),
    ).toEqual({
      kind: "bound",
      address: "traveler@example.com",
      verified: true,
    });
  });
});
