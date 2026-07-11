import type { EmailMessage, EmailSender } from "./types";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
}

/** Mask local-part for logs; keep domain for deliverability debugging. */
function redactRecipient(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "[redacted]";
  return `***@${email.slice(at + 1)}`;
}

/** HTTP sender for Resend (Workers-friendly; no SMTP socket). */
export function createResendEmailSender(
  options: ResendEmailSenderOptions,
): EmailSender {
  const { apiKey, from } = options;
  return {
    async send(message: EmailMessage): Promise<void> {
      const toLog = redactRecipient(message.to);
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `[email:resend] send failed status=${response.status} to=${toLog} from=${from} body=${body || response.statusText}`,
        );
        throw new Error(
          `Resend send failed (${response.status}): ${body || response.statusText}`,
        );
      }

      // Resend returns `{ id: "…" }` on success — log it for dashboard lookup.
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
      } | null;
      // warn so Workers Observability indexes the line (info is often dropped).
      console.warn(
        `[email:resend] accepted id=${payload?.id ?? "unknown"} to=${toLog} from=${from} subject=${message.subject}`,
      );
    },
  };
}
