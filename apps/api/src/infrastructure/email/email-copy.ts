import type { EmailLocale } from "./email-locale";

export type OtpEmailType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email"
  | "bind-email";

export type LinkEmailType = "reset-password" | "change-email-confirmation";

export interface OtpEmailCopy {
  subject: string;
  heading: string;
  intro: string;
  expiry: (minutes: number) => string;
  ignore: string;
}

export interface LinkEmailCopy {
  subject: string;
  heading: string;
  intro: string;
  button: string;
  orOpenLink: string;
  ignore: string;
  /** Shown when a detail line is provided (e.g. requested new email). */
  detail: (value: string) => string;
}

const OTP_COPY: Record<EmailLocale, Record<OtpEmailType, OtpEmailCopy>> = {
  en: {
    "sign-in": {
      subject: "Your OpenTrip sign-in code",
      heading: "Your sign-in code",
      intro: "Use this code to finish signing in to OpenTrip.",
      expiry: (m) => `It expires in ${m} minute${m === 1 ? "" : "s"}.`,
      ignore: "If you did not request this, you can ignore this email.",
    },
    "email-verification": {
      subject: "Verify your OpenTrip email",
      heading: "Verify your email",
      intro: "Enter this code to verify your OpenTrip account.",
      expiry: (m) => `It expires in ${m} minute${m === 1 ? "" : "s"}.`,
      ignore: "If you did not request this, you can ignore this email.",
    },
    "forget-password": {
      subject: "Reset your OpenTrip password",
      heading: "Reset your password",
      intro: "Enter this code to set a new password for your account.",
      expiry: (m) => `It expires in ${m} minute${m === 1 ? "" : "s"}.`,
      ignore: "If you did not request this, you can ignore this email.",
    },
    "change-email": {
      subject: "Confirm your new OpenTrip email",
      heading: "Confirm your new email",
      intro: "Enter this code to confirm your new email address.",
      expiry: (m) => `It expires in ${m} minute${m === 1 ? "" : "s"}.`,
      ignore: "If you did not request this, you can ignore this email.",
    },
    "bind-email": {
      subject: "Bind your OpenTrip email",
      heading: "Confirm your email",
      intro: "Enter this code to bind this email address to your OpenTrip account.",
      expiry: (m) => `It expires in ${m} minute${m === 1 ? "" : "s"}.`,
      ignore: "If you did not request this, you can ignore this email.",
    },
  },
  zh: {
    "sign-in": {
      subject: "你的 OpenTrip 登录验证码",
      heading: "登录验证码",
      intro: "请使用以下验证码完成 OpenTrip 登录。",
      expiry: (m) => `验证码将在 ${m} 分钟后失效。`,
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
    },
    "email-verification": {
      subject: "验证你的 OpenTrip 邮箱",
      heading: "验证邮箱",
      intro: "请输入以下验证码，以完成 OpenTrip 账号邮箱验证。",
      expiry: (m) => `验证码将在 ${m} 分钟后失效。`,
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
    },
    "forget-password": {
      subject: "重置你的 OpenTrip 密码",
      heading: "重置密码",
      intro: "请输入以下验证码，为账号设置新密码。",
      expiry: (m) => `验证码将在 ${m} 分钟后失效。`,
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
    },
    "change-email": {
      subject: "确认你的新 OpenTrip 邮箱",
      heading: "确认新邮箱",
      intro: "请输入以下验证码，以确认新的邮箱地址。",
      expiry: (m) => `验证码将在 ${m} 分钟后失效。`,
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
    },
    "bind-email": {
      subject: "绑定你的 OpenTrip 邮箱",
      heading: "确认邮箱",
      intro: "请输入以下验证码，将此邮箱绑定到你的 OpenTrip 账号。",
      expiry: (m) => `验证码将在 ${m} 分钟后失效。`,
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
    },
  },
};

const LINK_COPY: Record<EmailLocale, Record<LinkEmailType, LinkEmailCopy>> = {
  en: {
    "reset-password": {
      subject: "Reset your OpenTrip password",
      heading: "Reset your password",
      intro:
        "Use the button below to set a new password for your OpenTrip account.",
      button: "Reset password",
      orOpenLink: "Or open this link:",
      ignore: "If you did not request this, you can ignore this email.",
      detail: (value) => value,
    },
    "change-email-confirmation": {
      subject: "Confirm your OpenTrip email change",
      heading: "Confirm your email change",
      intro:
        "Confirm that you want to change the email on your OpenTrip account.",
      button: "Confirm email change",
      orOpenLink: "Or open this link:",
      ignore: "If you did not request this, you can ignore this email.",
      detail: (value) => `Requested new email: ${value}`,
    },
  },
  zh: {
    "reset-password": {
      subject: "重置你的 OpenTrip 密码",
      heading: "重置密码",
      intro: "点击下方按钮，为你的 OpenTrip 账号设置新密码。",
      button: "重置密码",
      orOpenLink: "或打开此链接：",
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
      detail: (value) => value,
    },
    "change-email-confirmation": {
      subject: "确认修改 OpenTrip 邮箱",
      heading: "确认修改邮箱",
      intro: "请确认你要更改 OpenTrip 账号绑定的邮箱。",
      button: "确认修改邮箱",
      orOpenLink: "或打开此链接：",
      ignore: "如果这不是你本人的操作，可以忽略这封邮件。",
      detail: (value) => `请求的新邮箱：${value}`,
    },
  },
};

export function otpEmailCopy(
  locale: EmailLocale,
  type: OtpEmailType,
): OtpEmailCopy {
  return OTP_COPY[locale][type];
}

export function linkEmailCopy(
  locale: EmailLocale,
  type: LinkEmailType,
): LinkEmailCopy {
  return LINK_COPY[locale][type];
}
