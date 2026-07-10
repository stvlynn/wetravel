import {
  TripService,
  TripInviteService,
  PreferenceService,
  WeatherService,
  FxService,
  GeoService,
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
import { AiSdkAgentModel } from "../ai/agent-model.ai-sdk";
import type { AppConfig } from "../config";

export interface CreateContainerOptions {
  /** Max connections for SQL + auth pools (Workers direct MySQL: use 1). */
  poolMax?: number;
}

export interface Container {
  config: AppConfig;
  pool: Pool;
  auth: Auth;
  tripService: TripService;
  tripInviteService: TripInviteService;
  preferenceService: PreferenceService;
  weatherService: WeatherService;
  fxService: FxService;
  geoService: GeoService;
  fileStorage: FileStorage;
  avatarService: AvatarService;
  tripMediaService: TripMediaService;
  /** Null when AI is not configured; agent routes then respond 404. */
  agentService: AgentService | null;
  /** Close SQL + auth driver pools (required on Workers per-request graphs). */
  dispose: () => Promise<void>;
}

/** Wire the runtime-neutral object graph around a selected storage adapter. */
export function createContainer(
  config: AppConfig,
  fileStorage: FileStorage,
  options?: CreateContainerOptions,
): Container {
  const poolMax = options?.poolMax ?? 5;
  // One shared Postgres pool for domain + Better Auth (Workers/Hyperdrive).
  const { pool, authDatabase } = createDatabaseHandles(config, {
    max: poolMax,
  });
  const tripRepository = new SqlTripRepository(pool);
  const auth = createAuth(config, authDatabase.driver, {
    tripRepository,
    loadSampleTripTemplate: createSampleTripTemplateLoader(tripRepository),
  });
  const tripService = new TripService(tripRepository);
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
  const geoService = new GeoService(createGeoProvider(config.geo));
  const agentService = config.ai
    ? new AgentService(
        tripRepository,
        new SqlAgentSessionRepository(pool),
        new AiSdkAgentModel(config.ai, weatherService, geoService),
        {
          proactiveThreshold: config.ai.proactiveThreshold,
        },
      )
    : null;

  return {
    config,
    pool,
    auth,
    tripService,
    tripInviteService,
    preferenceService,
    weatherService,
    fxService,
    geoService,
    fileStorage,
    avatarService,
    tripMediaService,
    agentService,
    dispose: async () => {
      // Postgres: pool.end() owns the shared driver. MySQL: end both handles.
      await Promise.allSettled([pool.end(), authDatabase.end()]);
    },
  };
}
