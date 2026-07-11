import { EMAIL_BRAND, escapeHtml } from "./email-brand";
import type { EmailLocale } from "./email-locale";
import { DEFAULT_EMAIL_LOCALE } from "./email-locale";

const { background, card, foreground, muted, border, brand, fontSans, maxWidth, siteUrl } =
  EMAIL_BRAND;

export interface EmailLayoutContent {
  /** BCP-47-ish lang for the document (`en` | `zh`). */
  locale?: EmailLocale;
  /** Preheader shown in inbox preview; keep short. */
  preview: string;
  /** Main heading inside the card. */
  heading: string;
  /** HTML body (already escaped / trusted fragments). */
  bodyHtml: string;
}

/**
 * Single-column card shell: muted silver canvas → white card → navy type.
 * Table layout + inline styles for Outlook / Gmail / Apple Mail.
 */
export function renderEmailLayout(content: EmailLayoutContent): string {
  const preview = escapeHtml(content.preview);
  const heading = escapeHtml(content.heading);
  const lang = content.locale ?? DEFAULT_EMAIL_LOCALE;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${background};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${preview}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${background};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${maxWidth}px;">
          <tr>
            <td style="padding:0 0 20px 4px;">
              <a href="${siteUrl}" style="text-decoration:none;color:${foreground};font-family:${fontSans};font-size:15px;font-weight:600;letter-spacing:-0.02em;">
                OpenTrip
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:${card};border:1px solid ${border};border-radius:${EMAIL_BRAND.radius};overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:3px;line-height:3px;font-size:0;background:${brand};">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 8px;font-family:${fontSans};">
                    <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:${foreground};text-wrap:balance;">
                      ${heading}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 28px;font-family:${fontSans};font-size:15px;line-height:1.55;color:${foreground};">
                    ${content.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-family:${fontSans};font-size:12px;line-height:1.5;color:${muted};">
              OpenTrip · <a href="${siteUrl}" style="color:${muted};text-decoration:underline;">opentrip.im</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Navy primary CTA — matches SPA primary button weight. */
export function renderEmailButton(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
  <tr>
    <td style="border-radius:${EMAIL_BRAND.radius};background:${EMAIL_BRAND.primary};">
      <a href="${safeHref}" style="display:inline-block;padding:12px 20px;font-family:${fontSans};font-size:14px;font-weight:600;line-height:1;color:${EMAIL_BRAND.primaryForeground};text-decoration:none;border-radius:${EMAIL_BRAND.radius};">
        ${safeLabel}
      </a>
    </td>
  </tr>
</table>`;
}

/** Large tabular OTP — hero of the message, like Vercel / Heidi inbox codes. */
export function renderOtpCode(otp: string): string {
  const digits = escapeHtml(otp.trim());
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td align="center" style="padding:18px 16px;background:${EMAIL_BRAND.brandMuted};border:1px solid ${border};border-radius:${EMAIL_BRAND.radius};">
      <span style="font-family:${EMAIL_BRAND.fontMono};font-size:32px;font-weight:600;letter-spacing:0.28em;line-height:1;color:${foreground};font-variant-numeric:tabular-nums;">
        ${digits}
      </span>
    </td>
  </tr>
</table>`;
}

export function renderMutedLine(text: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${muted};">${escapeHtml(text)}</p>`;
}

export function renderParagraph(text: string): string {
  return `<p style="margin:0 0 12px;color:${foreground};">${escapeHtml(text)}</p>`;
}
