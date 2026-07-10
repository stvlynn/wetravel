import { describe, expect, it, vi } from "vitest";
import type { Container } from "../src/infrastructure/composition/container";
import type { AppConfig } from "../src/infrastructure/config";
import { createApp } from "../src/interfaces/http/app";

const GOOGLE_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc";

function baseConfig(googleOAuth: AppConfig["googleOAuth"]): AppConfig {
  return {
    databaseUrl: "postgres://example.test/opentrip",
    betterAuthSecret: "a-secure-test-secret-with-32-characters",
    betterAuthUrl: "https://api.example.test",
    trustedOrigins: ["https://api.example.test", "opentrip://"],
    storage: {
      backend: "fs",
      root: "/data/uploads",
      publicUrl: "https://api.example.test/api/uploads",
    },
    googleOAuth,
    captcha: null,
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
    ai: null,
  };
}

function createTestApp(options: {
  googleOAuth: AppConfig["googleOAuth"];
  signInSocial?: ReturnType<typeof vi.fn>;
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
      getSession: vi.fn(async () => null),
      signInSocial,
      generateOneTimeToken: vi.fn(),
      verifyOneTimeToken: vi.fn(),
    },
    handler: vi.fn(),
    $Infer: {} as Container["auth"]["$Infer"],
  };

  const container = {
    config: baseConfig(options.googleOAuth),
    pool: {} as Container["pool"],
    auth: auth as unknown as Container["auth"],
    tripService: {} as Container["tripService"],
    tripInviteService: {} as Container["tripInviteService"],
    preferenceService: {} as Container["preferenceService"],
    weatherService: {} as Container["weatherService"],
    fxService: {} as Container["fxService"],
    geoService: {} as Container["geoService"],
    fileStorage: {} as Container["fileStorage"],
    avatarService: {} as Container["avatarService"],
    tripMediaService: {} as Container["tripMediaService"],
    agentService: null,
  } satisfies Container;

  return { app: createApp(container), signInSocial };
}

describe("mobile OAuth start", () => {
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
