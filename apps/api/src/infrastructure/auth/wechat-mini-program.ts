import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import {
  isInternalEmail,
  placeholderEmailForUser,
} from "../../application/user/email-address";
import type {
  ResolveWechatIdentity,
  WechatExternalIdentity,
} from "../../application/user/wechat-identity";

const WECHAT_PROVIDER_ID = "wechat";
const WECHAT_CODE2SESSION_URL =
  "https://api.weixin.qq.com/sns/jscode2session";

export interface WechatMiniProgramIdentity {
  openid: string;
  unionid?: string;
}

export interface WechatMiniProgramIdentityPort {
  exchangeCode(code: string): Promise<WechatMiniProgramIdentity>;
}

interface WechatCode2SessionResponse {
  openid?: string;
  unionid?: string;
  errcode?: number;
}

export interface WechatCode2SessionClientOptions {
  appId: string;
  appSecret: string;
  fetch?: typeof globalThis.fetch;
}

/** Server-side adapter for WeChat's Mini Program code2Session API. */
export class WechatCode2SessionClient implements WechatMiniProgramIdentityPort {
  readonly #appId: string;
  readonly #appSecret: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: WechatCode2SessionClientOptions) {
    this.#appId = options.appId;
    this.#appSecret = options.appSecret;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async exchangeCode(code: string): Promise<WechatMiniProgramIdentity> {
    const url = new URL(WECHAT_CODE2SESSION_URL);
    url.searchParams.set("appid", this.#appId);
    url.searchParams.set("secret", this.#appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    const response = await this.#fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("WeChat code exchange failed");

    const body = (await response.json()) as WechatCode2SessionResponse;
    if (body.errcode || !body.openid) {
      throw new Error("WeChat rejected the login code");
    }
    return {
      openid: body.openid,
      ...(body.unionid ? { unionid: body.unionid } : {}),
    };
  }
}

export interface WechatMiniProgramPluginOptions {
  identityPort: WechatMiniProgramIdentityPort;
  identityResolver: ResolveWechatIdentity;
  miniProgramIssuer: string;
  openPlatformIssuer: string;
}

/**
 * Better Auth endpoint for WeChat Mini Programs. Website QR OAuth remains the
 * built-in `wechat` social provider; when both apps share an Open Platform
 * account, UnionID gives both surfaces the same provider account identifier.
 */
export function wechatMiniProgram(
  options: WechatMiniProgramPluginOptions,
): BetterAuthPlugin {
  return {
    id: "wechat-mini-program",
    endpoints: {
      signInWechatMiniProgram: createAuthEndpoint(
        "/wechat-mini-program/sign-in",
        {
          method: "POST",
          body: z.object({ code: z.string().trim().min(1).max(256) }),
        },
        async (ctx) => {
          let identity: WechatMiniProgramIdentity;
          try {
            identity = await options.identityPort.exchangeCode(ctx.body.code);
          } catch {
            // Do not log the upstream request URL: it contains AppSecret.
            ctx.context.logger.warn("WeChat Mini Program sign-in failed");
            throw new APIError("UNAUTHORIZED", {
              code: "WECHAT_LOGIN_FAILED",
              message: "Unable to sign in with WeChat",
            });
          }

          const identities = externalIdentities(identity, options);
          const resolution = await options.identityResolver.resolve(identities);
          if (resolution.kind === "conflict") throw identityConflict();

          const canonicalAccountId = identity.unionid
            ? identity.unionid
            : `openid:${options.miniProgramIssuer}:${identity.openid}`;
          let user =
            resolution.kind === "resolved"
              ? await ctx.context.internalAdapter.findUserById(resolution.userId)
              : null;

          // Migrate users created by the former account-only implementation.
          // The external identity table becomes authoritative after this bind.
          if (!user) {
            const legacyCandidates = [
              ...(identity.unionid
                ? [
                    {
                      accountId: identity.unionid,
                      email: `${identity.unionid}@wechat.invalid`,
                    },
                  ]
                : []),
              {
                accountId: identity.openid,
                email: `${identity.openid}@wechat.invalid`,
              },
            ];
            for (const candidate of legacyCandidates) {
              const existing =
                await ctx.context.internalAdapter.findOAuthUser(
                  candidate.email,
                  candidate.accountId,
                  WECHAT_PROVIDER_ID,
                );
              if (existing?.user) {
                user = existing.user;
                break;
              }
            }
          }

          if (!user) {
            const placeholderId = crypto.randomUUID();
            const placeholderEmail = placeholderEmailForUser(placeholderId);
            try {
              const created =
                await ctx.context.internalAdapter.createOAuthUser(
                  {
                    name: "WeChat User",
                    email: placeholderEmail,
                    emailVerified: false,
                  },
                  {
                    accountId: canonicalAccountId,
                    providerId: WECHAT_PROVIDER_ID,
                  },
                );
              user = created.user;
            } catch (error) {
              // A concurrent first login may have won the unique provider
              // account insert. Re-read that winner; unrelated failures remain
              // visible instead of being converted to a fallback account.
              const winner =
                await ctx.context.internalAdapter.findOAuthUser(
                  placeholderEmail,
                  canonicalAccountId,
                  WECHAT_PROVIDER_ID,
                );
              if (!winner?.user) throw error;
              user = winner.user;
            }
          }

          const binding = await options.identityResolver.bind(user.id, identities);
          if (binding.kind === "conflict") throw identityConflict();

          if (isInternalEmail(user.email)) {
            user = await ctx.context.internalAdapter.updateUser(user.id, {
              email: placeholderEmailForUser(user.id),
              emailVerified: false,
              emailIsPlaceholder: true,
            });
          }

          const accounts = await ctx.context.internalAdapter.findAccounts(user.id);
          if (
            !accounts.some(
              (account) =>
                account.providerId === WECHAT_PROVIDER_ID &&
                account.accountId === canonicalAccountId,
            )
          ) {
            await ctx.context.internalAdapter.linkAccount({
              accountId: canonicalAccountId,
              providerId: WECHAT_PROVIDER_ID,
              userId: user.id,
            });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              code: "SESSION_CREATION_FAILED",
              message: "Unable to create a session",
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ token: session.token, user });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

function externalIdentities(
  identity: WechatMiniProgramIdentity,
  options: Pick<
    WechatMiniProgramPluginOptions,
    "miniProgramIssuer" | "openPlatformIssuer"
  >,
): WechatExternalIdentity[] {
  return [
    {
      provider: "wechat",
      subjectType: "openid",
      issuer: options.miniProgramIssuer,
      subject: identity.openid,
    },
    ...(identity.unionid
      ? [
          {
            provider: "wechat" as const,
            subjectType: "unionid" as const,
            issuer: options.openPlatformIssuer,
            subject: identity.unionid,
          },
        ]
      : []),
  ];
}

function identityConflict(): APIError {
  return new APIError("CONFLICT", {
    code: "WECHAT_IDENTITY_CONFLICT",
    message: "This WeChat identity is linked to another OpenTrip account",
  });
}
