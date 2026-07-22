import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import {
  isInternalEmail,
  normalizeEmail,
} from "../../application/user/email-address";

const BINDING_EXPIRES_IN_SECONDS = 300;
const FRESH_SESSION_AGE_MS = 10 * 60 * 1000;

export interface EmailBindingPluginOptions {
  sendVerificationOTP(input: {
    email: string;
    otp: string;
    expiresInSeconds: number;
    context: unknown;
  }): Promise<void>;
}

/** Bind the first real email without trying to verify an unreachable placeholder. */
export function emailBinding(
  options: EmailBindingPluginOptions,
): BetterAuthPlugin {
  return {
    id: "email-binding",
    endpoints: {
      requestEmailBinding: createAuthEndpoint(
        "/email-binding/request",
        {
          method: "POST",
          body: z.object({ email: z.string().trim().email().max(320) }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          assertFreshPlaceholderSession(ctx.context.session);
          const email = normalizeEmail(ctx.body.email);
          if (isInternalEmail(email)) throw invalidEmail();

          const identifier = bindingIdentifier(
            ctx.context.session.user.id,
            email,
          );
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            identifier,
          );

          // Keep the response generic while authenticated request logs retain
          // the stable error code for support diagnostics.
          if (await ctx.context.internalAdapter.findUserByEmail(email)) {
            throw new APIError("CONFLICT", {
              code: "EMAIL_ALREADY_IN_USE",
              message: "Email is already in use",
            });
          }

          const otp = generateOtp();
          const hash = await ctx.context.password.hash(otp);
          await ctx.context.internalAdapter.createVerificationValue({
            identifier,
            value: hash,
            expiresAt: new Date(
              Date.now() + BINDING_EXPIRES_IN_SECONDS * 1000,
            ),
          });
          await ctx.context.runInBackgroundOrAwait(
            options.sendVerificationOTP({
              email,
              otp,
              expiresInSeconds: BINDING_EXPIRES_IN_SECONDS,
              context: ctx,
            }),
          );
          return ctx.json({ success: true });
        },
      ),
      verifyEmailBinding: createAuthEndpoint(
        "/email-binding/verify",
        {
          method: "POST",
          body: z.object({
            email: z.string().trim().email().max(320),
            otp: z.string().regex(/^\d{6}$/),
          }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          assertFreshPlaceholderSession(ctx.context.session);
          const email = normalizeEmail(ctx.body.email);
          if (isInternalEmail(email)) throw invalidEmail();

          const identifier = bindingIdentifier(
            ctx.context.session.user.id,
            email,
          );
          const verification =
            await ctx.context.internalAdapter.consumeVerificationValue(
              identifier,
            );
          if (
            !verification ||
            verification.expiresAt.getTime() < Date.now() ||
            !(await ctx.context.password.verify({
              hash: verification.value,
              password: ctx.body.otp,
            }))
          ) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_EMAIL_BINDING_OTP",
              message: "Invalid or expired verification code",
            });
          }
          if (await ctx.context.internalAdapter.findUserByEmail(email)) {
            throw new APIError("CONFLICT", {
              code: "EMAIL_ALREADY_IN_USE",
              message: "Email is already in use",
            });
          }

          const updatedUser = await ctx.context.internalAdapter.updateUser(
            ctx.context.session.user.id,
            {
              email,
              emailVerified: true,
              emailIsPlaceholder: false,
            },
          );
          await setSessionCookie(ctx, {
            session: ctx.context.session.session,
            user: updatedUser,
          });
          return ctx.json({ success: true, user: updatedUser });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path.startsWith("/email-binding/"),
        window: 60,
        max: 3,
      },
    ],
  } satisfies BetterAuthPlugin;
}

function assertFreshPlaceholderSession(session: {
  session: { createdAt: Date | string };
  user: { email: string; emailIsPlaceholder?: boolean | null };
}): void {
  const placeholder =
    session.user.emailIsPlaceholder || isInternalEmail(session.user.email);
  if (!placeholder) {
    throw new APIError("BAD_REQUEST", {
      code: "EMAIL_ALREADY_BOUND",
      message: "Use the normal email change flow",
    });
  }
  if (
    Date.now() - new Date(session.session.createdAt).getTime() >
    FRESH_SESSION_AGE_MS
  ) {
    throw new APIError("FORBIDDEN", {
      code: "FRESH_AUTHENTICATION_REQUIRED",
      message: "Sign in with WeChat again before binding an email",
    });
  }
}

function bindingIdentifier(userId: string, email: string): string {
  return `email-binding:${userId}:${email}`;
}

function generateOtp(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String((bytes[0]! % 900_000) + 100_000);
}

function invalidEmail(): APIError {
  return new APIError("BAD_REQUEST", {
    code: "INVALID_EMAIL",
    message: "A real email address is required",
  });
}
