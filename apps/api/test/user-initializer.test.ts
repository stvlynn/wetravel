import { describe, expect, it } from "vitest";
import { resolveInitialAvatar } from "../src/application/user/user-initializer";
import { mapGoogleProfileToDto } from "../src/infrastructure/auth/oauth-profile-mapper";

describe("resolveInitialAvatar", () => {
  it("uses the OAuth profile image when present", () => {
    const url = resolveInitialAvatar({
      provider: "google",
      providerAccountId: "123",
      email: "a@example.com",
      name: "A",
      image: "https://example.com/avatar.png",
    });
    expect(url).toBe("https://example.com/avatar.png");
  });

  it("returns null when the OAuth image is missing so the client generates one", () => {
    const url = resolveInitialAvatar({
      provider: "google",
      providerAccountId: "123",
      email: "a@example.com",
      name: "A",
      image: null,
    });
    expect(url).toBeNull();
  });

  it("returns null for email sign-ups so the client generates one", () => {
    expect(resolveInitialAvatar(null)).toBeNull();
  });
});

describe("mapGoogleProfileToDto", () => {
  it("normalizes a Google userinfo profile into the OAuth DTO", () => {
    const dto = mapGoogleProfileToDto({
      sub: "123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      picture: "https://example.com/ada.png",
    });

    expect(dto).toEqual({
      provider: "google",
      providerAccountId: "123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: "https://example.com/ada.png",
    });
  });

  it("treats missing or non-string fields as null", () => {
    const dto = mapGoogleProfileToDto({
      sub: 123,
      picture: "",
    });

    expect(dto.provider).toBe("google");
    expect(dto.providerAccountId).toBe("unknown");
    expect(dto.email).toBeNull();
    expect(dto.name).toBeNull();
    expect(dto.image).toBeNull();
  });

  it("survives a non-object profile", () => {
    const dto = mapGoogleProfileToDto(null);
    expect(dto.providerAccountId).toBe("unknown");
    expect(dto.image).toBeNull();
  });
});
