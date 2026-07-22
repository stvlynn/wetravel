import { describe, expect, it, vi } from "vitest";
import type { Container } from "../src/infrastructure/composition/container";
import type { AppConfig } from "../src/infrastructure/config";
import { createApp } from "../src/interfaces/http/app";

const GOOGLE_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc";

function baseConfig(googleOAuth: AppConfig["googleOAuth"]): AppConfig {
  return {
    databaseProvider: "postgres",
    databaseUrl: "postgres://example.test/opentrip",
    databaseSsl: "off",
    betterAuthSecret: "a-secure-test-secret-with-32-characters",
    betterAuthUrl: "https://api.example.test",
    trustedOrigins: ["https://api.example.test", "opentrip://"],
    storage: {
      backend: "fs",
      root: "/data/uploads",
      publicUrl: "https://api.example.test/api/uploads",
    },
    googleOAuth,
    wechatOAuth: null,
    wechatMiniProgram: null,
    captcha: null,
    email: {
      provider: "console",
      from: "OpenTrip <noreply@localhost>",
      resendApiKey: undefined,
    },
    openWeatherMapApiKey: undefined,
    geo: {
      provider: "osm",
      osm: {
        nominatimBaseUrl: "https://nominatim.example.test",
        overpassBaseUrl: "https://overpass.example.test",
        osrmBaseUrl: "https://osrm.example.test",
        userAgent: "OpenTrip-test",
      },
      googleMapsApiKey: undefined,
      timeoutMs: 5_000,
      cacheTtlMs: 60_000,
    },
    lodging: {
      ignoreRobotsTxt: false,
      disableGeocoding: false,
      timeoutMs: 30_000,
      geocodeUserAgent: "OpenTrip-test",
    },
    ai: null,
    observability: {
      sentryDsn: undefined,
      environment: "test",
      release: undefined,
    },
    streetView: null,
    unsplashAccessKey: undefined,
  };
}

function createTestApp(options: {
  googleOAuth: AppConfig["googleOAuth"];
  signInSocial?: ReturnType<typeof vi.fn>;
  getSession?: ReturnType<typeof vi.fn>;
  generateOneTimeToken?: ReturnType<typeof vi.fn>;
  verifyOneTimeToken?: ReturnType<typeof vi.fn>;
}) {
  const signInSocial =
    options.signInSocial ??
    vi.fn(async () => {
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        "better-auth.state=signed-state; Path=/; HttpOnly; SameSite=Lax",
      );
      return {
        headers,
        response: { url: GOOGLE_AUTH_URL, redirect: false },
      };
    });

  const auth = {
    api: {
      getSession: options.getSession ?? vi.fn(async () => null),
      signInSocial,
      generateOneTimeToken: options.generateOneTimeToken ?? vi.fn(),
      verifyOneTimeToken: options.verifyOneTimeToken ?? vi.fn(),
    },
    handler: vi.fn(),
    $Infer: {} as Container["auth"]["$Infer"],
  };

  const container = {
    config: baseConfig(options.googleOAuth),
    pool: {} as Container["pool"],
    poolFresh: {} as Container["poolFresh"],
    auth: auth as unknown as Container["auth"],
    tripService: {} as Container["tripService"],
    tripInviteService: {} as Container["tripInviteService"],
    reservationService: {} as Container["reservationService"],
    preferenceService: {} as Container["preferenceService"],
    weatherService: {} as Container["weatherService"],
    fxService: {} as Container["fxService"],
    geoService: {} as Container["geoService"],
    lodgingService: {} as Container["lodgingService"],
    streetViewService: null,
    fileStorage: {} as Container["fileStorage"],
    avatarService: {} as Container["avatarService"],
    tripMediaService: {} as Container["tripMediaService"],
    agentService: null,
    trackDeferred: () => {},
    disposeAfterDeferred: async () => {},
    dispose: async () => {},
  } satisfies Container;

  return { app: createApp(container), signInSocial };
}

describe("mobile OAuth start", () => {
  it("returns a stable request id on every API response", async () => {
    const { app } = createTestApp({ googleOAuth: null });
    const generated = await app.request("/api/health");
    expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);

    const supplied = await app.request("/api/health", {
      headers: { "x-request-id": "request_client-123" },
    });
    expect(supplied.headers.get("x-request-id")).toBe("request_client-123");
  });

  it("redirects to Google and forwards OAuth state cookies", async () => {
    const { app, signInSocial } = createTestApp({
      googleOAuth: { clientId: "id", clientSecret: "secret" },
    });

    const response = await app.request(
      "https://api.example.test/api/mobile-auth/oauth/start?provider=google",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(GOOGLE_AUTH_URL);
    expect(response.headers.getSetCookie()).toEqual([
      "better-auth.state=signed-state; Path=/; HttpOnly; SameSite=Lax",
    ]);
    expect(signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          provider: "google",
          callbackURL: "https://api.example.test/api/mobile-auth/oauth/complete",
          disableRedirect: true,
        },
        returnHeaders: true,
      }),
    );
  });

  it("redirects to the app callback when Google is not configured", async () => {
    const { app, signInSocial } = createTestApp({ googleOAuth: null });

    const response = await app.request(
      "https://api.example.test/api/mobile-auth/oauth/start?provider=google",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "opentrip://auth/callback?error=oauth_unavailable",
    );
    expect(signInSocial).not.toHaveBeenCalled();
  });
});

describe("Mini Program WebView session bridge", () => {
  const session = {
    session: {
      id: "session-1",
      token: "session-token",
      userId: "user-1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
    user: {
      id: "user-1",
      name: "WeChat User",
      email: "wechat+user-1@identity.invalid",
      emailVerified: false,
      emailIsPlaceholder: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };

  it("mints a server-only one-time code from a bearer session", async () => {
    const generateOneTimeToken = vi.fn(async () => ({
      token: "one-time-webview-code",
    }));
    const { app } = createTestApp({
      googleOAuth: null,
      getSession: vi.fn(async () => session),
      generateOneTimeToken,
    });

    const response = await app.request(
      "https://api.example.test/api/mobile-auth/webview/mint",
      {
        method: "POST",
        headers: { Authorization: "Bearer session-token" },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { code: "one-time-webview-code" },
    });
    expect(generateOneTimeToken).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("rejects minting without an authenticated session", async () => {
    const generateOneTimeToken = vi.fn();
    const { app } = createTestApp({
      googleOAuth: null,
      generateOneTimeToken,
    });

    const response = await app.request(
      "https://api.example.test/api/mobile-auth/webview/mint",
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    expect(generateOneTimeToken).not.toHaveBeenCalled();
  });

  it("exchanges a one-time code and forwards the HttpOnly cookie", async () => {
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      "better-auth.session_token=cookie-token; Path=/; HttpOnly; Secure; SameSite=None",
    );
    const verifyOneTimeToken = vi.fn(
      async () =>
        new Response(JSON.stringify(session), {
          status: 200,
          headers,
        }),
    );
    const { app } = createTestApp({
      googleOAuth: null,
      verifyOneTimeToken,
    });

    const response = await app.request(
      "https://api.example.test/api/mobile-auth/webview/exchange",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "https://api.example.test",
        },
        body: JSON.stringify({ code: "one-time-webview-code" }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      "better-auth.session_token=cookie-token; Path=/; HttpOnly; Secure; SameSite=None",
    ]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(verifyOneTimeToken).toHaveBeenCalledWith({
      body: { token: "one-time-webview-code" },
      asResponse: true,
    });
  });

  it("rejects expired or reused codes without setting a cookie", async () => {
    const verifyOneTimeToken = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: "Invalid or expired one-time token" }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    const { app } = createTestApp({
      googleOAuth: null,
      verifyOneTimeToken,
    });

    const response = await app.request(
      "https://api.example.test/api/mobile-auth/webview/exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "expired-webview-code" }),
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "webview_code_invalid",
        message: "WebView sign-in code is invalid or expired",
      },
    });
  });
});
