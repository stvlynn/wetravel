import type { EmailMessage, EmailSender } from "./types";

/** Dev/test sender: logs the message (including OTP) to stdout. */
export function createConsoleEmailSender(): EmailSender {
  return {
    async send(message: EmailMessage): Promise<void> {
      console.info(
        `[email:console] to=${message.to} subject=${JSON.stringify(message.subject)} html=${message.html ? "yes" : "no"}\n${message.text}`,
      );
    },
  };
}
