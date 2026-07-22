import { createAuthClient } from "better-auth/react";
import {
  emailOTPClient,
  inferAdditionalFields,
  twoFactorClient,
} from "better-auth/client/plugins";
import { config } from "@/shared/config";
import i18n from "@/shared/i18n";

/** Set by AuthForm so twoFactorClient can switch the UI without a full reload. */
let onTwoFactorRequired: (() => void) | null = null;

export function setTwoFactorRequiredHandler(handler: (() => void) | null): void {
  onTwoFactorRequired = handler;
}

/** Better Auth React client. `baseURL` is the API origin; default `basePath`
 * `/api/auth` matches the Hono mount. In dev, Vite proxies `/api` to :8780.
 *
 * `inferAdditionalFields` mirrors the server's `user.additionalFields` so
 * `session.user.defaultCurrency` is typed on the client. The API lives in a
 * separate package, so the field shape is declared explicitly rather than
 * inferred from the server `auth` instance.
 *
 * `emailOTPClient` enables OTP send/verify for email registration and change.
 * `twoFactorClient` handles TOTP enrollment and the post-sign-in challenge.
 *
 * Every auth request sends `x-opentrip-lang` so transactional mail matches
 * the SPA language (`en` | `zh`). */
export const authClient = createAuthClient({
  baseURL: config.baseUrl,
  basePath: "/api/auth",
  fetchOptions: {
    onRequest(context) {
      const headers = new Headers(context.headers);
      headers.set(
        "x-opentrip-lang",
        i18n.resolvedLanguage?.split("-")[0] ?? i18n.language?.split("-")[0] ?? "en",
      );
      return { ...context, headers };
    },
  },
  plugins: [
    emailOTPClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        onTwoFactorRequired?.();
      },
    }),
    inferAdditionalFields({
      user: {
        defaultCurrency: {
          type: "string",
          required: false,
          input: true,
        },
        twoFactorEnabled: {
          type: "boolean",
          required: false,
          input: false,
        },
        emailIsPlaceholder: {
          type: "boolean",
          required: false,
          input: false,
        },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;

export function requestEmailBinding(email: string) {
  return authClient.$fetch<{ success: boolean }>("/email-binding/request", {
    method: "POST",
    body: { email },
  });
}

export function verifyEmailBinding(email: string, otp: string) {
  return authClient.$fetch<{ success: boolean }>("/email-binding/verify", {
    method: "POST",
    body: { email, otp },
  });
}
