import { describe, expect, it } from "vitest";
import {
  deliverableEmail,
  isInternalEmail,
  placeholderEmailForUser,
} from "../src/application/user/email-address";
import { createEmailSender } from "../src/infrastructure/email/create-email-sender";

describe("email address policy", () => {
  it("never exposes placeholder addresses as deliverable email", () => {
    expect(isInternalEmail("wechat+user@identity.invalid")).toBe(true);
    expect(
      deliverableEmail({
        email: "wechat+user@identity.invalid",
        emailVerified: true,
        emailIsPlaceholder: false,
      }),
    ).toBeNull();
    expect(
      deliverableEmail({
        email: "USER@EXAMPLE.COM",
        emailVerified: true,
        emailIsPlaceholder: false,
      }),
    ).toBe("user@example.com");
  });

  it("generates an opaque compatibility address from the internal user id", () => {
    expect(placeholderEmailForUser("user-123")).toBe(
      "wechat+user-123@identity.invalid",
    );
  });

  it("blocks internal addresses at the final sender boundary", async () => {
    const sender = createEmailSender({
      provider: "console",
      from: "OpenTrip <noreply@localhost>",
      resendApiKey: undefined,
    });
    await expect(
      sender.send({
        to: "wechat+user@identity.invalid",
        subject: "Never sent",
        text: "Never sent",
      }),
    ).rejects.toThrow("internal placeholder");
  });
});
