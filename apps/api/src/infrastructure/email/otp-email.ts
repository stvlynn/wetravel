import type { EmailMessage } from "./types";
import { escapeHtml } from "./email-brand";
import { otpEmailCopy, type OtpEmailType } from "./email-copy";
import type { EmailLocale } from "./email-locale";
import { DEFAULT_EMAIL_LOCALE } from "./email-locale";
import {
  renderEmailLayout,
  renderMutedLine,
  renderOtpCode,
  renderParagraph,
} from "./email-layout";

export type { OtpEmailType };

/** Build OTP mail with branded HTML + plain-text fallback. */
export function buildOtpEmail(input: {
  to: string;
  otp: string;
  type: OtpEmailType;
  expiresInSeconds: number;
  locale?: EmailLocale;
}): EmailMessage {
  const locale = input.locale ?? DEFAULT_EMAIL_LOCALE;
  const copy = otpEmailCopy(locale, input.type);
  const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
  const expiryLine = copy.expiry(minutes);

  const text = [
    copy.intro,
    "",
    locale === "zh"
      ? `验证码：${input.otp}`
      : `Your verification code is ${input.otp}.`,
    expiryLine,
    "",
    copy.ignore,
  ].join("\n");

  const bodyHtml = [
    renderParagraph(copy.intro),
    renderOtpCode(input.otp),
    `<p style="margin:0;font-size:14px;color:#6d788f;">${escapeHtml(expiryLine)}</p>`,
    renderMutedLine(copy.ignore),
  ].join("");

  return {
    to: input.to,
    subject: copy.subject,
    text,
    html: renderEmailLayout({
      locale,
      preview: `${input.otp} · ${copy.subject}`,
      heading: copy.heading,
      bodyHtml,
    }),
  };
}
