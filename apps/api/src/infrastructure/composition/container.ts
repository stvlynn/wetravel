import { TripService, TripInviteService, PreferenceService } from "../../application";
import { AvatarService, type FileStorage } from "../../application/avatar";
import { createPool, type Pool } from "../persistence/pool";
import { PgTripRepository } from "../persistence/trip-repository.pg";
import { PgTripInviteRepository } from "../persistence/invite-repository.pg";
import { PgUserPreferenceRepository } from "../persistence/user-preference-repository.pg";
import { createAuth, type Auth } from "../auth/auth";
import type { AppConfig } from "../config";

export interface Container {
  config: AppConfig;
  pool: Pool;
  auth: Auth;
  tripService: TripService;
  tripInviteService: TripInviteService;
  preferenceService: PreferenceService;
  fileStorage: FileStorage;
  avatarService: AvatarService;
}

/** Wire the runtime-neutral object graph around a selected storage adapter. */
export function createContainer(config: AppConfig, fileStorage: FileStorage): Container {
  const pool = createPool(config.databaseUrl);
  const auth = createAuth(config, pool);
  const tripRepository = new PgTripRepository(pool);
  const tripService = new TripService(tripRepository);
  const tripInviteService = new TripInviteService(
    new PgTripInviteRepository(pool),
    tripRepository,
  );
  const preferenceService = new PreferenceService(new PgUserPreferenceRepository(pool));
  const avatarService = new AvatarService(fileStorage);
  return {
    config,
    pool,
    auth,
    tripService,
    tripInviteService,
    preferenceService,
    fileStorage,
    avatarService,
  };
}
