import { describe, expect, it, vi } from "vitest";
import { WechatCode2SessionClient } from "../src/infrastructure/auth/wechat-mini-program";

describe("WechatCode2SessionClient", () => {
  it("exchanges a temporary login code for the stable WeChat identity", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(
        JSON.stringify({
          openid: "open-id",
          unionid: "union-id",
          session_key: "must-not-leave-the-adapter",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new WechatCode2SessionClient({
      appId: "mini-app-id",
      appSecret: "mini-secret",
      fetch,
    });

    await expect(client.exchangeCode("temporary-code")).resolves.toEqual({
      openid: "open-id",
      unionid: "union-id",
    });

    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://api.weixin.qq.com/sns/jscode2session",
    );
    expect(Object.fromEntries(requestedUrl.searchParams)).toEqual({
      appid: "mini-app-id",
      secret: "mini-secret",
      js_code: "temporary-code",
      grant_type: "authorization_code",
    });
  });

  it("rejects WeChat errors without returning upstream details", async () => {
    const client = new WechatCode2SessionClient({
      appId: "mini-app-id",
      appSecret: "mini-secret",
      fetch: vi.fn(async () =>
        new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    await expect(client.exchangeCode("expired-code")).rejects.toThrow(
      "WeChat rejected the login code",
    );
  });
});
