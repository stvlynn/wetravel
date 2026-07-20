import {
  TripService,
  TripInviteService,
  PreferenceService,
  WeatherService,
  FxService,
  GeoService,
  LodgingService,
  AgentService,
  StreetViewGroundingService,
  TripMediaService,
  StreetViewService,
  ReservationService,
  UserProfileProjectionService,
} from "../../application";
import { AvatarService } from "../../application/avatar";
import type { FileStorage } from "../../application/storage";
import { createDatabaseHandles, type Pool } from "../persistence/pool";
import { SqlTripRepository } from "../persistence/trip-repository.db";
import { SqlTripInviteRepository } from "../persistence/invite-repository.db";
import { SqlUserPreferenceRepository } from "../persistence/user-preference-repository.db";
import { SqlAgentSessionRepository } from "../persistence/agent-repository.db";
import { SqlReservationRepository } from "../persistence/reservation-repository.db";
import {
  createAuth,
  type Auth,
  type AuthRateLimitStorage,
} from "../auth";
import { createSampleTripTemplateLoader } from "../persistence/sample-trip-template";
import { CachedWeatherClient } from "../weather/cached-weather-client";
import { OpenWeatherMapClient } from "../weather/openweather-client";
import { CachedFxClient } from "../fx/cached-fx-client";
import { FrankfurterClient } from "../fx/frankfurter-client";
import { createGeoProvider } from "../geo/create-geo-provider";
import { AirbnbLodgingProvider } from "../lodging/airbnb-provider";
import { AiSdkAgentModel } from "../ai/agent-model.ai-sdk";
import { UnsplashCoverProvider } from "../cover/unsplash-cover-provider";
import type { AppConfig } from "../config";
import type { TripChangePublisher } from "../../domain/realtime";
import { MapillaryStreetViewProvider } from "../street-view/mapillary/mapillary-provider";
import { MemoryStreetViewCache } from "../street-view/memory-street-view-cache";
import type { StreetViewCache } from "../../application/street-view";
import { observability } from "../observability";

export interface CreateContainerOptions {
  /** Shared runtime cache for provider metadata and preview bytes. */
  streetViewCache?: StreetViewCache;
  /**
   * Max connections for the cache-enabled pool. This pool is reserved for
   * explicitly stale-tolerant read models.
   */
  poolMax?: number;
  /**
   * Max connections for the cache-disabled consistency pool.
   * Ignored when `freshDatabaseUrl` is omitted or equals `config.databaseUrl`
   * (single shared pool).
   */
  poolMaxFresh?: number;
  /**
   * Connection string for business state, authorization, and commands that
   * must not hit Hyperdrive query cache. When omitted or identical to
   * `config.databaseUrl`, a single shared pool is used (Node/direct DB).
   */
  freshDatabaseUrl?: string;
  /** Cloudflare Durable Object publisher. Omitted outside the Worker runtime. */
  tripChangePublisher?: TripChangePublisher;
  /** Cloudflare-global Better Auth limiter. Omitted outside Workers. */
  authRateLimitStorage?: AuthRateLimitStorage;
  /** Trusted client-IP headers used to partition authentication limits. */
  authIpAddressHeaders?: string[];
}

export interface Container {
  config: AppConfig;
  /** Cache-enabled (or sole) SQL client for explicitly stale-tolerant reads. */
  pool: Pool;
  /**
   * Cache-disabled SQL client for all consistency-critical repositories. Same
   * object as `pool` when no separate fresh URL is configured.
   */
  poolFresh: Pool;
  auth: Auth;
  tripService: TripService;
  tripInviteService: TripInviteService;
  reservationService: ReservationService;
  preferenceService: PreferenceService;
  weatherService: WeatherService;
  fxService: FxService;
  geoService: GeoService;
  lodgingService: LodgingService;
  streetViewService: StreetViewService | null;
  fileStorage: FileStorage;
  avatarService: AvatarService;
  tripMediaService: TripMediaService;
  /** Null when AI is not configured; agent routes then respond 404. */
  agentService: AgentService | null;
  /**
   * Register a promise that must finish before pools are closed (Workers
   * `waitUntil` ambient agent work).
   */
  trackDeferred: (task: Promise<unknown>) => void;
  /**
   * Wait for tracked deferred tasks, then close SQL + auth driver pools.
   * Prefer this over `dispose` on Workers so ambient work is not racing
   * `pool.end()`.
   */
  disposeAfterDeferred: () => Promise<void>;
  /** Close SQL + auth driver pools immediately (Node shutdown / tests). */
  dispose: () => Promise<void>;
}

/** Wire the runtime-neutral object graph around a selected storage adapter. */
export function createContainer(
  config: AppConfig,
  fileStorage: FileStorage,
  options?: CreateContainerOptions,
): Container {
  const poolMax = options?.poolMax ?? 5;
  const poolMaxFresh = options?.poolMaxFresh ?? 2;
  const freshUrl = options?.freshDatabaseUrl?.trim();
  const sharePool =
    !freshUrl || freshUrl === config.databaseUrl.trim();

  const cached = createDatabaseHandles(config, { max: poolMax });
  const poolCached = cached.pool;

  let poolFresh: Pool;
  let authDriver: unknown;
  let endAuthSide: () => Promise<void>;
  let endCachedSide: () => Promise<void>;

  if (sharePool) {
    poolFresh = poolCached;
    authDriver = cached.authDatabase.driver;
    endAuthSide = cached.authDatabase.end;
    endCachedSide = async () => {};
  } else {
    const freshConfig: AppConfig = { ...config, databaseUrl: freshUrl };
    const fresh = createDatabaseHandles(freshConfig, { max: poolMaxFresh });
    poolFresh = fresh.pool;
    authDriver = fresh.authDatabase.driver;
    endAuthSide = fresh.authDatabase.end;
    endCachedSide = cached.authDatabase.end;
  }

  // Domain aggregates, permissions, invites, preferences, auth, and agent
  // sessions are consistency-critical. Hyperdrive does not invalidate cached
  // SELECTs after writes, so these adapters must all use the fresh binding.
  const tripRepository = new SqlTripRepository(poolFresh);
  const profileProjection = new UserProfileProjectionService(
    tripRepository,
    options?.tripChangePublisher ?? null,
  );
  const auth = createAuth(config, authDriver, {
    tripRepository,
    profileProjection,
    loadSampleTripTemplate: createSampleTripTemplateLoader(tripRepository),
    rateLimitStorage: options?.authRateLimitStorage,
    ipAddressHeaders: options?.authIpAddressHeaders,
  });
  const coverImages = new UnsplashCoverProvider(config.unsplashAccessKey);
  const geoService = new GeoService(createGeoProvider(config.geo));
  const tripService = new TripService(
    tripRepository,
    coverImages,
    geoService,
    options?.tripChangePublisher ?? null,
  );
  const tripInviteService = new TripInviteService(
    new SqlTripInviteRepository(poolFresh),
    tripRepository,
    options?.tripChangePublisher ?? null,
  );
  const reservationService = new ReservationService(
    tripRepository,
    new SqlReservationRepository(poolFresh),
    options?.tripChangePublisher ?? null,
  );
  const preferenceService = new PreferenceService(
    new SqlUserPreferenceRepository(poolFresh),
  );
  const avatarService = new AvatarService(fileStorage);
  const tripMediaService = new TripMediaService(fileStorage, tripService);
  const openWeatherClient = new OpenWeatherMapClient(config.openWeatherMapApiKey);
  const cachedWeatherClient = new CachedWeatherClient(openWeatherClient);
  const weatherService = new WeatherService(cachedWeatherClient);
  const frankfurterClient = new FrankfurterClient();
  const cachedFxClient = new CachedFxClient(frankfurterClient);
  const fxService = new FxService(cachedFxClient);
  const lodgingService = new LodgingService(
    new AirbnbLodgingProvider(config.lodging),
  );
  const streetViewService = config.streetView
      ? new StreetViewService(
        new MapillaryStreetViewProvider(
          config.streetView.mapillaryAccessToken,
          config.streetView.timeoutMs,
        ),
        options?.streetViewCache ?? new MemoryStreetViewCache(),
        observability,
      )
    : null;
  const agentService = config.ai
    ? new AgentService(
        tripRepository,
        new SqlAgentSessionRepository(poolFresh),
        new AiSdkAgentModel(
          config.ai,
          weatherService,
          geoService,
          lodgingService,
          fileStorage,
        ),
        new StreetViewGroundingService(
          geoService,
          streetViewService,
          observability,
        ),
        {
          proactiveThreshold: config.ai.proactiveThreshold,
        },
        options?.tripChangePublisher ?? null,
        observability,
      )
    : null;

  const deferred: Promise<unknown>[] = [];

  const disposePools = async () => {
    if (sharePool) {
      await Promise.allSettled([poolCached.end(), endAuthSide()]);
      return;
    }
    await Promise.allSettled([
      poolCached.end(),
      endCachedSide(),
      poolFresh.end(),
      endAuthSide(),
    ]);
  };

  return {
    config,
    pool: poolCached,
    poolFresh,
    auth,
    tripService,
    tripInviteService,
    reservationService,
    preferenceService,
    weatherService,
    fxService,
    geoService,
    lodgingService,
    streetViewService,
    fileStorage,
    avatarService,
    tripMediaService,
    agentService,
    trackDeferred: (task) => {
      deferred.push(task);
    },
    disposeAfterDeferred: async () => {
      if (deferred.length > 0) {
        await Promise.allSettled(deferred);
      }
      await disposePools();
    },
    dispose: disposePools,
  };
}
