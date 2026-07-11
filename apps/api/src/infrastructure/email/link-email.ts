import type { EmailMessage } from "./types";
import { escapeHtml } from "./email-brand";
import { linkEmailCopy, type LinkEmailType } from "./email-copy";
import type { EmailLocale } from "./email-locale";
import { DEFAULT_EMAIL_LOCALE } from "./email-locale";
import {
  renderEmailButton,
  renderEmailLayout,
  renderMutedLine,
  renderParagraph,
} from "./email-layout";

export type { LinkEmailType };

/** Build action-link mail with branded HTML + plain-text fallback. */
export function buildLinkEmail(input: {
  to: string;
  type: LinkEmailType;
  url: string;
  /** Optional context line, e.g. the proposed new email. */
  detail?: string;
  locale?: EmailLocale;
}): EmailMessage {
  const locale = input.locale ?? DEFAULT_EMAIL_LOCALE;
  const copy = linkEmailCopy(locale, input.type);
  const detailLine = input.detail ? copy.detail(input.detail) : undefined;

  const text = [
    copy.intro,
    ...(detailLine ? [detailLine, ""] : [""]),
    input.url,
    "",
    copy.ignore,
  ].join("\n");

  const bodyHtml = [
    renderParagraph(copy.intro),
    detailLine
      ? `<p style="margin:0 0 12px;color:#6d788f;font-size:14px;">${escapeHtml(detailLine)}</p>`
      : "",
    renderEmailButton(copy.button, input.url),
    `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6d788f;word-break:break-all;">${escapeHtml(copy.orOpenLink)}<br /><a href="${escapeHtml(input.url)}" style="color:#3f6fc9;text-decoration:underline;">${escapeHtml(input.url)}</a></p>`,
    renderMutedLine(copy.ignore),
  ].join("");

  return {
    to: input.to,
    subject: copy.subject,
    text,
    html: renderEmailLayout({
      locale,
      preview: copy.subject,
      heading: copy.heading,
      bodyHtml,
    }),
  };
}
