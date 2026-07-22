import type { EmailConfig } from "../config";
import { isInternalEmail } from "../../application/user/email-address";
import { createConsoleEmailSender } from "./console-email-sender";
import { createResendEmailSender } from "./resend-email-sender";
import type { EmailSender } from "./types";

/** Select the email adapter from env-backed {@link EmailConfig}. */
export function createEmailSender(config: EmailConfig): EmailSender {
  let sender: EmailSender;
  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    sender = createResendEmailSender({
      apiKey: config.resendApiKey,
      from: config.from,
    });
  } else {
    sender = createConsoleEmailSender();
  }
  return {
    async send(message) {
      if (isInternalEmail(message.to)) {
        throw new Error("Refusing to send email to an internal placeholder");
      }
      await sender.send(message);
    },
  };
}

export type { EmailSender, EmailMessage } from "./types";
