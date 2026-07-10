import {
  TripService,
  TripInviteService,
  PreferenceService,
  WeatherService,
  FxService,
  GeoService,
  LodgingService,
  AgentService,
  TripMediaService,
} from "../../application";
import { AvatarService } from "../../application/avatar";
import type { FileStorage } from "../../application/storage";
import { createDatabaseHandles, type Pool } from "../persistence/pool";
import { SqlTripRepository } from "../persistence/trip-repository.db";
import { SqlTripInviteRepository } from "../persistence/invite-repository.db";
import { SqlUserPreferenceRepository } from "../persistence/user-preference-repository.db";
import { SqlAgentSessionRepository } from "../persistence/agent-repository.db";
import { createAuth, type Auth } from "../auth/auth";
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

export interface CreateContainerOptions {
  /**
   * Max connections for the cached domain pool (Workers: prefer 3 when a
   * separate fresh pool is also open).
   */
  poolMax?: number;
  /**
   * Max connections for the cache-disabled fresh pool (auth + agent).
   * Ignored when `freshDatabaseUrl` is omitted or equals `config.databaseUrl`
   * (single shared pool).
   */
  poolMaxFresh?: number;
  /**
   * Connection string for auth + agent session reads that must not hit
   * Hyperdrive query cache. When omitted or identical to `config.databaseUrl`,
   * a single shared pool is used (Node / single-binding Workers).
   */
  freshDatabaseUrl?: string;
}

export interface Container {
  config: AppConfig;
  /** Cached (or sole) SQL client — trip aggregate and ordinary reads. */
  pool: Pool;
  /**
   * Cache-disabled SQL client for Better Auth + agent session. Same object as
   * `pool` when no separate fresh URL is configured.
   */
  poolFresh: Pool;
  auth: Auth;
  tripService: TripService;
  tripInviteService: TripInviteService;
  preferenceService: PreferenceService;
  weatherService: WeatherService;
  fxService: FxService;
  geoService: GeoService;
  lodgingService: LodgingService;
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
  const pool = cached.pool;

  let poolFresh: Pool;
  let authDriver: unknown;
  let endAuthSide: () => Promise<void>;
  let endCachedSide: () => Promise<void>;

  if (sharePool) {
    poolFresh = pool;
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

  const tripRepository = new SqlTripRepository(pool);
  const auth = createAuth(config, authDriver, {
    tripRepository,
    loadSampleTripTemplate: createSampleTripTemplateLoader(tripRepository),
  });
  const coverImages = new UnsplashCoverProvider(config.unsplashAccessKey);
  const geoService = new GeoService(createGeoProvider(config.geo));
  const tripService = new TripService(tripRepository, coverImages, geoService);
  const tripInviteService = new TripInviteService(
    new SqlTripInviteRepository(pool),
    tripRepository,
  );
  const preferenceService = new PreferenceService(
    new SqlUserPreferenceRepository(pool),
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
        {
          proactiveThreshold: config.ai.proactiveThreshold,
        },
      )
    : null;

  const deferred: Promise<unknown>[] = [];

  const disposePools = async () => {
    if (sharePool) {
      await Promise.allSettled([pool.end(), endAuthSide()]);
      return;
    }
    await Promise.allSettled([
      pool.end(),
      endCachedSide(),
      poolFresh.end(),
      endAuthSide(),
    ]);
  };

  return {
    config,
    pool,
    poolFresh,
    auth,
    tripService,
    tripInviteService,
    preferenceService,
    weatherService,
    fxService,
    geoService,
    lodgingService,
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
