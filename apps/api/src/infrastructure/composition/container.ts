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
import { createPool, type Pool } from "../persistence/pool";
import { PgTripRepository } from "../persistence/trip-repository.pg";
import { PgTripInviteRepository } from "../persistence/invite-repository.pg";
import { PgUserPreferenceRepository } from "../persistence/user-preference-repository.pg";
import { PgAgentSessionRepository } from "../persistence/agent-repository.pg";
import { createAuth, type Auth } from "../auth/auth";
import { createSampleTripTemplateLoader } from "../persistence/sample-trip-template";
import { CachedWeatherClient } from "../weather/cached-weather-client";
import { OpenWeatherMapClient } from "../weather/openweather-client";
import { CachedFxClient } from "../fx/cached-fx-client";
import { FrankfurterClient } from "../fx/frankfurter-client";
import { createGeoProvider } from "../geo/create-geo-provider";
import { AiSdkAgentModel } from "../ai/agent-model.ai-sdk";
import type { AppConfig } from "../config";

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
}

/** Wire the runtime-neutral object graph around a selected storage adapter. */
export function createContainer(config: AppConfig, fileStorage: FileStorage): Container {
  const pool = createPool(config.databaseUrl);
  const tripRepository = new PgTripRepository(pool);
  const auth = createAuth(config, pool, {
    tripRepository,
    loadSampleTripTemplate: createSampleTripTemplateLoader(tripRepository),
  });
  const tripService = new TripService(tripRepository);
  const tripInviteService = new TripInviteService(
    new PgTripInviteRepository(pool),
    tripRepository,
  );
  const preferenceService = new PreferenceService(new PgUserPreferenceRepository(pool));
  const avatarService = new AvatarService(fileStorage);
  const tripMediaService = new TripMediaService(fileStorage, tripService);
  // Weather: HTTP + agent tools call WeatherService only. Provider clients stay
  // behind WeatherClient (cache decorator → OpenWeatherMap today).
  const openWeatherClient = new OpenWeatherMapClient(config.openWeatherMapApiKey);
  const cachedWeatherClient = new CachedWeatherClient(openWeatherClient);
  const weatherService = new WeatherService(cachedWeatherClient);
  // FX: budget settle-up calls FxService only. Provider stays behind FxClient
  // (cache decorator → Frankfurter today).
  const frankfurterClient = new FrankfurterClient();
  const cachedFxClient = new CachedFxClient(frankfurterClient);
  const fxService = new FxService(cachedFxClient);
  // Geo: agent read tools call GeoService only. Provider (OSM | Google) is
  // selected at composition time via GEO_PROVIDER.
  const geoService = new GeoService(createGeoProvider(config.geo));
  const agentService = config.ai
    ? new AgentService(
        tripRepository,
        new PgAgentSessionRepository(pool),
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
  };
}
