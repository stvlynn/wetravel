import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

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

          const accountId = identity.unionid ?? identity.openid;
          const email = `${accountId}@wechat.invalid`;
          let existing = await ctx.context.internalAdapter.findOAuthUser(
            email,
            accountId,
            WECHAT_PROVIDER_ID,
          );

          // If a Mini Program is bound to Open Platform after users already
          // signed in with openid, promote that account to UnionID instead of
          // creating a duplicate user. Future web QR login then resolves the
          // newly linked UnionID account as well.
          if (!existing && identity.unionid) {
            existing = await ctx.context.internalAdapter.findOAuthUser(
              `${identity.openid}@wechat.invalid`,
              identity.openid,
              WECHAT_PROVIDER_ID,
            );
          }

          let user = existing?.user;
          if (!user) {
            const created = await ctx.context.internalAdapter.createOAuthUser(
              {
                name: "WeChat User",
                email,
                emailVerified: true,
              },
              { accountId, providerId: WECHAT_PROVIDER_ID },
            );
            user = created.user;
          } else if (existing?.linkedAccount?.accountId !== accountId) {
            await ctx.context.internalAdapter.linkAccount({
              accountId,
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
