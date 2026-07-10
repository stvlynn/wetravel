export interface GoogleOAuthConfig {
    clientId: string;
    clientSecret: string;
}

export type CaptchaProvider =
    | "cloudflare-turnstile"
    | "google-recaptcha"
    | "hcaptcha"
    | "captchafox";

export interface CaptchaConfig {
    provider: CaptchaProvider;
    secretKey: string;
}

export interface AiConfig {
    provider: string;
    model: string;
    baseUrl: string | null;
    apiKey: string;
    /** Minimum model confidence in [0, 1] before a proactive toast is created. */
    proactiveThreshold: number;
    /** Upper bound on tool-call steps per chat generation. */
    maxToolSteps: number;
}

export type GeoProviderName = "osm" | "google";

export interface OsmGeoEndpoints {
    nominatimBaseUrl: string;
    overpassBaseUrl: string;
    osrmBaseUrl: string;
    /** Required identifying User-Agent for public OSM endpoints. */
    userAgent: string;
}

export interface GeoConfig {
    provider: GeoProviderName;
    osm: OsmGeoEndpoints;
    /** Required when provider is `google`. */
    googleMapsApiKey: string | undefined;
    timeoutMs: number;
    cacheTtlMs: number;
}

export type DatabaseProvider = "postgres" | "mysql";

/** MySQL TLS mode for direct connections (Hyperdrive manages TLS separately). */
export type DatabaseSslMode = "off" | "required" | "verify";

export interface AppConfig {
    /** SQL backend: PostgreSQL (default) or MySQL/MariaDB. */
    databaseProvider: DatabaseProvider;
    databaseUrl: string;
    /**
     * TLS for direct MySQL (Worker secret `DATABASE_URL` path).
     * - off: plain TCP
     * - required: TLS, do not verify CA (common for managed cloud MySQL)
     * - verify: TLS + verify server certificate
     */
    databaseSsl: DatabaseSslMode;
    betterAuthSecret: string;
    betterAuthUrl: string;
    trustedOrigins: string[];
    storage: StorageConfig;
    googleOAuth: GoogleOAuthConfig | null;
    captcha: CaptchaConfig | null;
    openWeatherMapApiKey: string | undefined;
    geo: GeoConfig;
    /** Trip agent model configuration. Null disables the agent entirely. */
    ai: AiConfig | null;
}

interface StorageConfigBase {
    publicUrl: string;
}

export interface FileSystemStorageConfig extends StorageConfigBase {
    backend: "fs";
    root: string;
}

export interface S3StorageConfig extends StorageConfigBase {
    backend: "s3";
    root: string;
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
}

export type StorageConfig = FileSystemStorageConfig | S3StorageConfig;

export interface RawEnv {
    BASE_URL?: string;
    /** Explicit SQL backend: `postgres` | `mysql`. Inferred from DATABASE_URL when omitted. */
    DATABASE_PROVIDER?: string;
    DATABASE_URL?: string;
    /**
     * MySQL TLS for direct connections: `off` | `required` (default for mysql) | `verify`.
     * Also accepts `true`/`false`. Ignored for Postgres / Hyperdrive.
     */
    DATABASE_SSL?: string;
    BETTER_AUTH_SECRET?: string;
    TRUSTED_ORIGINS?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    CAPTCHA_PROVIDER?: string;
    CAPTCHA_SECRET_KEY?: string;
    STORAGE_BACKEND?: string;
    STORAGE_ROOT?: string;
    STORAGE_PUBLIC_URL?: string;
    S3_BUCKET?: string;
    S3_REGION?: string;
    S3_ENDPOINT?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_SECRET_ACCESS_KEY?: string;
    S3_FORCE_PATH_STYLE?: string;
    OPENWEATHERMAP_API_KEY?: string;
    VITE_OPENWEATHERMAP_API_KEY?: string;
    GEO_PROVIDER?: string;
    GEO_OSM_NOMINATIM_URL?: string;
    GEO_OSM_OVERPASS_URL?: string;
    GEO_OSM_OSRM_URL?: string;
    GEO_OSM_USER_AGENT?: string;
    GEO_TIMEOUT_MS?: string;
    GEO_CACHE_TTL_MS?: string;
    GOOGLE_MAPS_API_KEY?: string;
    AI_PROVIDER?: string;
    AI_MODEL?: string;
    AI_BASE_URL?: string;
    AI_API_KEY?: string;
    AI_PROACTIVE_THRESHOLD?: string;
    AI_MAX_TOOL_STEPS?: string;
}

const CAPTCHA_PROVIDERS: CaptchaProvider[] = [
    "cloudflare-turnstile",
    "google-recaptcha",
    "hcaptcha",
    "captchafox",
];

function parseCaptchaConfig(env: RawEnv): CaptchaConfig | null {
    const provider = env.CAPTCHA_PROVIDER?.trim();
    if (!provider) return null;

    if (!CAPTCHA_PROVIDERS.includes(provider as CaptchaProvider)) {
        throw new Error(
            `CAPTCHA_PROVIDER must be one of ${CAPTCHA_PROVIDERS.join(", ")}`,
        );
    }

    const secretKey = env.CAPTCHA_SECRET_KEY?.trim();
    if (!secretKey) {
        throw new Error(
            "CAPTCHA_SECRET_KEY is required when CAPTCHA_PROVIDER is set",
        );
    }

    return { provider: provider as CaptchaProvider, secretKey };
}

/** Build validated config from an env-like object. A Hyperdrive connection
 * string overrides DATABASE_URL on Workers. */
export function loadConfig(env: RawEnv, connectionString?: string): AppConfig {
    const databaseUrl = connectionString ?? env.DATABASE_URL;
    if (!databaseUrl)
        throw new Error("DATABASE_URL (or Hyperdrive binding) is required");

    const databaseProvider = resolveDatabaseProvider(
        env.DATABASE_PROVIDER,
        databaseUrl,
    );
    const databaseSsl = resolveDatabaseSsl(env.DATABASE_SSL, databaseProvider);

    const betterAuthSecret = env.BETTER_AUTH_SECRET;
    if (!betterAuthSecret || betterAuthSecret.length < 32) {
        throw new Error(
            "BETTER_AUTH_SECRET must be set and at least 32 characters",
        );
    }

    const baseUrl = requireEnv(env.BASE_URL, "BASE_URL");
    const publicUrl =
        env.STORAGE_PUBLIC_URL?.trim() ||
        `${baseUrl.replace(/\/$/, "")}/api/uploads`;

    const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
    const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

    return {
        databaseProvider,
        databaseUrl,
        databaseSsl,
        betterAuthSecret,
        betterAuthUrl: baseUrl,
        trustedOrigins: (env.TRUSTED_ORIGINS ?? `${baseUrl},opentrip://`)
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean),
        storage: loadStorageConfig(env, publicUrl),
        googleOAuth:
            googleClientId && googleClientSecret
                ? { clientId: googleClientId, clientSecret: googleClientSecret }
                : null,
        captcha: parseCaptchaConfig(env),
        openWeatherMapApiKey:
          env.OPENWEATHERMAP_API_KEY?.trim() ||
          env.VITE_OPENWEATHERMAP_API_KEY?.trim(),
        geo: parseGeoConfig(env),
        ai: parseAiConfig(env),
    };
}

const DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_OSRM_URL = "https://router.project-osrm.org";
const DEFAULT_GEO_TIMEOUT_MS = 12_000;
const DEFAULT_GEO_CACHE_TTL_MS = 30 * 60 * 1000;

/** Geo provider selection. Defaults to OSM; Google requires an API key. */
function parseGeoConfig(env: RawEnv): GeoConfig {
    const providerRaw = env.GEO_PROVIDER?.trim().toLowerCase() || "osm";
    if (providerRaw !== "osm" && providerRaw !== "google") {
        throw new Error('GEO_PROVIDER must be either "osm" or "google"');
    }
    const provider = providerRaw as GeoProviderName;
    const googleMapsApiKey = env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
    if (provider === "google" && !googleMapsApiKey) {
        throw new Error(
            "GOOGLE_MAPS_API_KEY is required when GEO_PROVIDER=google",
        );
    }

    const userAgent =
        env.GEO_OSM_USER_AGENT?.trim() ||
        "OpenTrip/0.1 (https://github.com/stvlynn/OpenTrip; geo-agent)";

    return {
        provider,
        osm: {
            nominatimBaseUrl:
                env.GEO_OSM_NOMINATIM_URL?.trim() || DEFAULT_NOMINATIM_URL,
            overpassBaseUrl:
                env.GEO_OSM_OVERPASS_URL?.trim() || DEFAULT_OVERPASS_URL,
            osrmBaseUrl: env.GEO_OSM_OSRM_URL?.trim() || DEFAULT_OSRM_URL,
            userAgent,
        },
        googleMapsApiKey,
        timeoutMs: parseNumber(
            env.GEO_TIMEOUT_MS,
            "GEO_TIMEOUT_MS",
            DEFAULT_GEO_TIMEOUT_MS,
        ),
        cacheTtlMs: parseNumber(
            env.GEO_CACHE_TTL_MS,
            "GEO_CACHE_TTL_MS",
            DEFAULT_GEO_CACHE_TTL_MS,
        ),
    };
}

/** Agent config. Requires AI_MODEL and AI_API_KEY together; absence of either
 * disables the trip agent rather than failing startup. */
function parseAiConfig(env: RawEnv): AiConfig | null {
    const model = env.AI_MODEL?.trim();
    const apiKey = env.AI_API_KEY?.trim();
    if (!model || !apiKey) return null;

    return {
        provider: env.AI_PROVIDER?.trim() || "openai",
        model,
        baseUrl: env.AI_BASE_URL?.trim() || null,
        apiKey,
        proactiveThreshold: parseNumber(
            env.AI_PROACTIVE_THRESHOLD,
            "AI_PROACTIVE_THRESHOLD",
            0.7,
        ),
        maxToolSteps: parseNumber(env.AI_MAX_TOOL_STEPS, "AI_MAX_TOOL_STEPS", 5),
    };
}

function parseNumber(
    value: string | undefined,
    name: string,
    fallback: number,
): number {
    const trimmed = value?.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
    return parsed;
}

function loadStorageConfig(env: RawEnv, publicUrl: string): StorageConfig {
    const backend = requireEnv(env.STORAGE_BACKEND, "STORAGE_BACKEND");
    if (backend === "fs") {
        return {
            backend,
            root: requireEnv(env.STORAGE_ROOT, "STORAGE_ROOT"),
            publicUrl,
        };
    }
    if (backend === "s3") {
        return {
            backend,
            root: env.STORAGE_ROOT?.trim().replace(/^\/+|\/+$/g, "") ?? "",
            publicUrl,
            bucket: requireEnv(env.S3_BUCKET, "S3_BUCKET"),
            region: requireEnv(env.S3_REGION, "S3_REGION"),
            endpoint: requireEnv(env.S3_ENDPOINT, "S3_ENDPOINT"),
            accessKeyId: requireEnv(env.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
            secretAccessKey: requireEnv(
                env.S3_SECRET_ACCESS_KEY,
                "S3_SECRET_ACCESS_KEY",
            ),
            forcePathStyle: parseBoolean(
                env.S3_FORCE_PATH_STYLE,
                "S3_FORCE_PATH_STYLE",
            ),
        };
    }
    throw new Error('STORAGE_BACKEND must be either "fs" or "s3"');
}

function requireEnv(value: string | undefined, name: string): string {
    const trimmed = value?.trim();
    if (!trimmed) throw new Error(`${name} is required`);
    return trimmed;
}

/** Prefer DATABASE_PROVIDER; otherwise infer from the connection string scheme. */
function resolveDatabaseProvider(
    providerRaw: string | undefined,
    databaseUrl: string,
): DatabaseProvider {
    const explicit = providerRaw?.trim().toLowerCase();
    if (explicit === "postgres" || explicit === "postgresql") return "postgres";
    if (explicit === "mysql" || explicit === "mariadb") return "mysql";
    if (explicit) {
        throw new Error(
            `DATABASE_PROVIDER must be "postgres" or "mysql" (got "${providerRaw}")`,
        );
    }
    const url = databaseUrl.trim();
    if (
        url.startsWith("mysql://") ||
        url.startsWith("mysql2://") ||
        url.startsWith("mariadb://")
    ) {
        return "mysql";
    }
    return "postgres";
}

/**
 * Resolve MySQL TLS mode. Default `required` for mysql (managed clouds often
 * force TLS); postgres defaults to `off` (use URL sslmode instead).
 */
function resolveDatabaseSsl(
    raw: string | undefined,
    provider: DatabaseProvider,
): DatabaseSslMode {
    const v = raw?.trim().toLowerCase();
    if (!v) return provider === "mysql" ? "required" : "off";
    if (v === "off" || v === "false" || v === "0" || v === "disable") return "off";
    if (v === "required" || v === "require" || v === "true" || v === "1") {
        return "required";
    }
    if (v === "verify" || v === "verify-ca" || v === "verify-full") return "verify";
    throw new Error(
        `DATABASE_SSL must be "off", "required", or "verify" (got "${raw}")`,
    );
}

function parseBoolean(value: string | undefined, name: string): boolean {
    if (value === undefined || value.trim() === "") return false;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${name} must be either "true" or "false"`);
}
